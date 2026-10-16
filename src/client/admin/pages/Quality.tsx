import { useState } from "react";
import { Link } from "react-router-dom";
import { AdminApiError, cc } from "../api";
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
  fmtNum,
} from "../ui";

interface Summary {
  rule: string;
  outcomes: Record<string, number>;
  rules: { outcome: string; rule: string; n: number; hidden: number }[];
  issues: Record<string, number>;
  hidden: number;
}
interface Row {
  id: string;
  title: string;
  subcategory: string | null;
  city: string | null;
  websiteUrl: string | null;
  webStatus: string | null;
  active: number;
  blurb: string;
  outcome: string;
  rule: string;
  reason: string;
  confidence: string;
  issues: string[];
  hidden: boolean;
  source: string;
  duplicateOf: string | null;
}
interface ListResp {
  rows: Row[];
  total: number;
  page: number;
  pageCount: number;
}

export const OUTCOME_LABEL: Record<string, string> = {
  approved: "Goedgekeurd",
  fix_data: "Gegevens corrigeren",
  manual: "Handmatige controle",
  exclude: "Uitgesloten",
  duplicate: "Dubbel",
  closed: "Niet meer actief",
};
const OUTCOME_TONE: Record<string, string> = {
  approved: "green",
  fix_data: "amber",
  manual: "blue",
  exclude: "red",
  duplicate: "slate",
  closed: "slate",
};
const ISSUE_LABEL: Record<string, string> = {
  photo_generic: "geen eigen foto",
  description_bare: "geen echte omschrijving",
  website_missing: "geen website",
  website_unreliable: "website onbetrouwbaar",
  address_missing: "geen adres",
  price_unknown: "prijs onbekend",
};

export function Quality() {
  const summary = useResource<Summary>(() => cc<Summary>("/quality/summary"), "quality-summary");
  const [outcome, setOutcome] = useState("exclude");
  const [rule, setRule] = useState("");
  const [qInput, setQInput] = useState("");
  const q = useDebounced(qInput, 350);
  const [page, setPage] = useState(1);
  const key = `${outcome}|${rule}|${q}|${page}`;
  const list = useResource<ListResp>(
    () => cc<ListResp>(`/quality/list?outcome=${outcome}&rule=${encodeURIComponent(rule)}&q=${encodeURIComponent(q)}&page=${page}`),
    key,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<string>) => {
    setBusy(true);
    setNotice(null);
    try {
      setNotice(await fn());
      list.reload();
      summary.reload();
    } catch (e) {
      setNotice(e instanceof AdminApiError || e instanceof Error ? e.message : "Mislukt.");
    } finally {
      setBusy(false);
    }
  };
  const decide = (id: string, decision: string, label: string) =>
    act(async () => {
      await cc(`/quality/activity/${id}`, { method: "POST", body: { decision } });
      return label;
    });

  const s = summary.data;
  const rulesOfOutcome = (s?.rules ?? []).filter((r) => r.outcome === outcome);

  return (
    <>
      <PageTitle title="Kwaliteit van de catalogus" />
      <p className="mb-3 max-w-3xl text-[13px] text-slate-600">
        {s?.rule ??
          "Een bedrijf wordt niet toegelaten alleen omdat het een fysieke locatie, website of commerciële activiteit heeft."}{" "}
        Uitsluiten verbergt een activiteit alleen (zacht): id, favorieten, matches en statistieken blijven bestaan en alles is herstelbaar.
      </p>
      {summary.error && <ErrorNote message={summary.error} onRetry={summary.reload} />}
      {summary.loading && !s && <Loading />}
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
          {Object.keys(OUTCOME_LABEL).map((k) => (
            <StatTile
              key={k}
              label={OUTCOME_LABEL[k]!}
              value={fmtNum(s.outcomes[k] ?? 0)}
              onClick={() => {
                setOutcome(k);
                setRule("");
                setPage(1);
              }}
            />
          ))}
        </div>
      )}
      {s && (
        <p className="mb-3 text-[12px] text-slate-500">
          Gegevensproblemen over alle gecontroleerde activiteiten: {fmtNum(s.issues.photo)} zonder eigen foto · {fmtNum(s.issues.description)} zonder echte
          omschrijving · {fmtNum(s.issues.websiteMissing)} zonder website · {fmtNum(s.issues.websiteUnreliable)} met onbetrouwbare website ·{" "}
          {fmtNum(s.issues.addressMissing)} zonder adres · {fmtNum(s.issues.price)} zonder prijsinformatie. Nu verborgen: {fmtNum(s.hidden)}.
        </p>
      )}

      <Panel
        title={`${OUTCOME_LABEL[outcome]} — per regel`}
        bodyClassName=""
        right={
          <Select value={outcome} onChange={(e) => { setOutcome(e.target.value); setRule(""); setPage(1); }}>
            {Object.entries(OUTCOME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        }
      >
        <Table>
          <thead>
            <tr><Th>Regel</Th><Th>Aantal</Th><Th>Verborgen</Th><Th /></tr>
          </thead>
          <tbody>
            {rulesOfOutcome.length === 0 && <tr><Td className="py-4 text-center text-slate-400">Geen regels voor deze uitkomst.</Td></tr>}
            {rulesOfOutcome.map((r) => (
              <Tr key={r.rule} onClick={() => { setRule(rule === r.rule ? "" : r.rule); setPage(1); }}>
                <Td mono>{r.rule}{rule === r.rule ? "  ◂" : ""}</Td>
                <Td>{fmtNum(r.n)}</Td>
                <Td>{fmtNum(r.hidden ?? 0)}</Td>
                <Td>
                  {(r.hidden ?? 0) > 0 && (
                    <Btn
                      variant="neutral"
                      className="!px-2 !py-1"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!window.confirm(`Regel "${r.rule}" ongedaan maken? ${r.hidden} verborgen activiteit(en) worden weer zichtbaar (als "handmatige controle").`)) return;
                        void act(async () => {
                          const x = await cc<{ restored: number }>("/quality/restore-rule", { method: "POST", body: { rule: r.rule } });
                          return `${x.restored} activiteit(en) hersteld.`;
                        });
                      }}
                    >
                      Regel ongedaan maken
                    </Btn>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <Panel
        className="mt-4"
        title={`Activiteiten: ${OUTCOME_LABEL[outcome]}${rule ? ` · ${rule}` : ""}`}
        bodyClassName=""
        right={<Input placeholder="zoek op naam…" value={qInput} onChange={(e) => { setQInput(e.target.value); setPage(1); }} className="w-52" />}
      >
        {notice && <p className="border-b border-slate-100 px-3 py-2 text-[13px] text-slate-700">{notice}</p>}
        {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}
        {list.loading && !list.data && <Loading />}
        {list.data && (
          <>
            <Table>
              <thead>
                <tr><Th>Activiteit</Th><Th>Type</Th><Th>Reden</Th><Th>Gegevens</Th><Th>Acties</Th></tr>
              </thead>
              <tbody>
                {list.data.rows.length === 0 && <tr><Td className="py-6 text-center text-slate-400">Niets gevonden.</Td></tr>}
                {list.data.rows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="max-w-[260px]">
                      <Link to={`/admin/activities/${r.id}`} className="font-medium text-brand-600 hover:underline">{r.title}</Link>
                      <div className="text-[11px] text-slate-400">{r.city ?? "—"}{r.hidden ? " · verborgen" : ""}</div>
                      <div className="truncate text-[11px] text-slate-500" title={r.blurb}>{r.blurb}</div>
                    </Td>
                    <Td className="text-xs text-slate-600">{r.subcategory ?? "—"}</Td>
                    <Td className="max-w-[300px] text-xs text-slate-600">
                      <Badge tone={(OUTCOME_TONE[r.outcome] ?? "slate") as never}>{OUTCOME_LABEL[r.outcome]}</Badge>{" "}
                      <span className="font-mono text-[10px] text-slate-400">{r.rule} · {r.confidence}{r.source === "owner" ? " · eigenaar" : ""}</span>
                      <div>{r.reason}</div>
                    </Td>
                    <Td className="text-[11px] text-slate-500">
                      {r.issues.map((i) => ISSUE_LABEL[i] ?? i).join(" · ") || "—"}
                      {r.websiteUrl && (
                        <div>
                          <a href={r.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">website ↗</a>
                        </div>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        {(r.hidden || r.outcome !== "approved") && (
                          <Btn className="!px-2 !py-1" disabled={busy} onClick={() => decide(r.id, "approve", "Goedgekeurd en zichtbaar.")}>
                            {r.hidden ? "Herstellen" : "Goedkeuren"}
                          </Btn>
                        )}
                        {!r.hidden && (
                          <Btn variant="danger" className="!px-2 !py-1" disabled={busy} onClick={() => decide(r.id, "exclude", "Uitgesloten (verborgen, herstelbaar).")}>
                            Uitsluiten
                          </Btn>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pager page={list.data.page} pageCount={list.data.pageCount} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Panel>
    </>
  );
}
