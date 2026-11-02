import { useEffect, useState } from "react";
import { AdminApiError } from "../api";
import { cc } from "../api";
import { Badge, Btn, ErrorNote, Loading } from "../ui";
import {
  ActivityForm,
  EMPTY_ACTIVITY_FORM,
  activityFormToBody,
  dbRowToFormValues,
  type ActivityFormValues,
} from "./ActivityForm";
import type { SwipeCardData } from "./swipe-types";

const DAY_LABEL: Record<string, string> = { mon: "ma", tue: "di", wed: "wo", thu: "do", fri: "vr", sat: "za", sun: "zo" };
const EVIDENCE_LABEL: Record<string, string> = {
  verified: "bevestigd",
  likely: "waarschijnlijk",
  unverified: "niet bevestigd",
  invalid: "ongeldig",
  not_found: "niet gevonden",
  conflict: "tegenstrijdig",
};
const date = (sec?: number | null) => (sec ? new Date(sec * 1000).toLocaleDateString("nl-BE") : "—");

/* -------------------------------------------------------------------------- */
/*  Details drawer                                                            */
/* -------------------------------------------------------------------------- */

export function DetailsDrawer({
  id,
  onClose,
  onDecide,
  onEdit,
  onReresearch,
}: {
  id: string;
  onClose: () => void;
  onDecide: (card: SwipeCardData, decision: "keep" | "delete" | "later") => void;
  onEdit: (card: SwipeCardData) => void;
  onReresearch: (card: SwipeCardData, on: boolean) => void;
}) {
  const [card, setCard] = useState<SwipeCardData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setCard(null);
    setErr(null);
    cc<{ card: SwipeCardData }>(`/swipe/activity/${encodeURIComponent(id)}`)
      .then((r) => live && setCard(r.card))
      .catch((e) => live && setErr(e instanceof Error ? e.message : "Kon de details niet laden."));
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl" role="dialog" aria-label="Details">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
          <h2 className="truncate text-base font-bold text-slate-900">{card?.title ?? "Details"}</h2>
          <Btn variant="ghost" onClick={onClose} aria-label="Sluiten">
            ✕ Sluiten
          </Btn>
        </header>
        {err && <div className="p-5"><ErrorNote message={err} /></div>}
        {!card && !err && <div className="p-8"><Loading /></div>}
        {card && (
          <div className="space-y-5 p-5 text-[13px] text-slate-700">
            {card.imageUrl && <img src={card.imageUrl} alt="" className="h-52 w-full rounded-xl object-cover" />}
            <div className="flex flex-wrap gap-2">
              {card.deleted ? (
                <Btn variant="primary" onClick={() => onDecide(card, "keep")}>↩ Herstellen</Btn>
              ) : (
                <>
                  <Btn variant="primary" onClick={() => onDecide(card, "keep")}>✓ Behouden</Btn>
                  <Btn variant="danger" onClick={() => onDecide(card, "delete")}>🗑 Verwijderen</Btn>
                  <Btn onClick={() => onDecide(card, "later")}>⏭ Later bekijken</Btn>
                </>
              )}
              <Btn onClick={() => onEdit(card)}>✎ Bewerken</Btn>
              {card.decision === "keep" && (
                <Btn onClick={() => onReresearch(card, !card.reresearch)}>
                  {card.reresearch ? "✕ Onderzoek-verzoek intrekken" : "🔍 Opnieuw laten onderzoeken"}
                </Btn>
              )}
            </div>

            <Section title="Beslissing">
              <p>
                {card.decision === "keep" && "Behouden door de eigenaar."}
                {card.decision === "delete" && "Verwijderd door de eigenaar (kan hersteld worden)."}
                {card.decision === "later" && "Uitgesteld: nog geen definitieve beslissing."}
                {(!card.decision || card.decision === "none") && "Nog niet beoordeeld."}
                {card.decidedAt ? ` Laatst gewijzigd: ${date(card.decidedAt)}.` : ""}
              </p>
              <p className="mt-1 text-slate-500">
                Behouden betekent niet dat de gegevens kloppen: de status hieronder is de technische verificatie.
              </p>
            </Section>

            <Section title="Omschrijving">
              <p className="whitespace-pre-line leading-relaxed">{card.description || "—"}</p>
            </Section>

            <Section title="Locatie">
              <p>{[card.address, card.city, card.country].filter(Boolean).join(", ") || card.locationLabel}</p>
              {card.lat != null && card.lng != null && (
                <a
                  className="text-brand-700 underline"
                  target="_blank"
                  rel="noreferrer noopener"
                  href={`https://www.openstreetmap.org/?mlat=${card.lat}&mlon=${card.lng}#map=16/${card.lat}/${card.lng}`}
                >
                  Bekijk op de kaart ({card.lat.toFixed(4)}, {card.lng.toFixed(4)})
                </a>
              )}
            </Section>

            <Section title="Website & contact">
              <p>
                {card.websiteUrl ? (
                  <a className="break-all text-brand-700 underline" href={card.websiteUrl} target="_blank" rel="noreferrer noopener">
                    {card.websiteUrl}
                  </a>
                ) : (
                  "Geen website."
                )}
                {card.webStatus && <span className="ml-2"><Badge tone={card.webStatus === "alive" ? "green" : "amber"}>site: {card.webStatus}</Badge></span>}
              </p>
              {card.contacts.length ? (
                <ul className="mt-1 space-y-1">
                  {card.contacts.map((c) => (
                    <li key={c.email} className="flex flex-wrap items-center gap-2">
                      <span className="break-all font-medium">{c.email}</span>
                      <Badge tone={c.evidence === "verified" ? "green" : c.evidence === "likely" ? "blue" : "slate"}>
                        {EVIDENCE_LABEL[c.evidence] ?? c.evidence}
                      </Badge>
                      <span className="text-xs text-slate-500">geldt voor: {c.scope === "organisation" ? "hele organisatie" : c.scope === "location" ? "deze locatie" : "deze activiteit"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-slate-500">Geen e-mailadres gekoppeld.</p>
              )}
              {card.organisation && (
                <p className="mt-1 text-slate-500">
                  Organisatie: <span className="font-medium text-slate-700">{card.organisation.name}</span> ({card.organisation.domain}, {card.organisation.activityCount} activiteit(en))
                </p>
              )}
            </Section>

            <Section title="Prijs & openingsuren">
              <p>
                {card.priceType === "free" ? "Gratis" : card.priceCents != null ? `€${(card.priceCents / 100).toFixed(2)} (${card.priceType})` : "Prijs onbekend"} · band {card.priceBand}
              </p>
              {card.openingHours && Object.keys(card.openingHours).length > 0 ? (
                <p className="mt-1">{Object.entries(card.openingHours).map(([d, h]) => `${DAY_LABEL[d] ?? d} ${h}`).join(" · ")}</p>
              ) : (
                <p className="mt-1 text-slate-500">Geen openingsuren bekend.</p>
              )}
            </Section>

            <Section title="Onderzoek & audit">
              <p>
                Status in de database: <Badge tone={card.status === "verified" ? "green" : "amber"}>{card.status}</Badge>{" "}
                {!card.active && <Badge tone="slate">niet actief</Badge>}
              </p>
              {card.audit && (
                <p className="mt-1">
                  Audit: <span className="font-medium">{card.audit.outcome}</span> ({card.audit.source}) — {card.audit.reason}
                </p>
              )}
              {card.research ? (
                <>
                  <p className="mt-1">
                    Onderzoek ({card.research.method}, {date(card.research.researchedAt)}): bestaat <b>{card.research.existence}</b>, geschikt <b>{card.research.suitability}</b>, oordeel <b>{card.research.verdict}</b>.
                  </p>
                  {card.research.note && <p className="mt-1 rounded bg-slate-50 p-2">{card.research.note}</p>}
                </>
              ) : (
                <p className="mt-1 text-slate-500">Nog niet onderzocht.</p>
              )}
              {card.corrections && card.corrections.length > 0 && (
                <div className="mt-2">
                  <p className="font-semibold text-slate-800">Correctievoorstellen (nog niet toegepast)</p>
                  <ul className="mt-1 space-y-1">
                    {card.corrections.map((c, i) => (
                      <li key={i} className="rounded border border-amber-200 bg-amber-50 p-2">
                        <b>{c.field}</b>: <span className="line-through opacity-70">{c.from || "∅"}</span> → <b>{c.to}</b>
                        {c.confidence && <span className="ml-2 text-xs text-slate-500">zekerheid: {c.confidence}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {card.evidence && card.evidence.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer font-semibold text-slate-800">Bewijs per veld ({card.evidence.length})</summary>
                  <ul className="mt-1 space-y-1">
                    {card.evidence.map((e, i) => (
                      <li key={i} className="rounded border border-slate-200 p-2">
                        <b>{e.field}</b> — {e.status}: {e.verified || e.found}
                        {e.sourceUrl && (
                          <a className="ml-2 text-brand-700 underline" href={e.sourceUrl} target="_blank" rel="noreferrer noopener">bron</a>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Section>
          </div>
        )}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Edit / add modal                                                          */
/* -------------------------------------------------------------------------- */

interface Lookalike {
  id: string;
  title: string;
  city?: string | null;
  active?: boolean;
  reason: string;
}

export function ActivityEditorModal({
  activityId,
  onClose,
  onSaved,
  onShowDeleted,
}: {
  /** null = add a new activity */
  activityId: string | null;
  onClose: () => void;
  onSaved: (id: string) => void;
  /** jump to the "Verwijderd" list for a lookalike the owner removed earlier */
  onShowDeleted: (title: string) => void;
}) {
  const [form, setForm] = useState<ActivityFormValues | null>(activityId ? null : EMPTY_ACTIVITY_FORM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [conflictInfo, setConflictInfo] = useState<{ code: string; duplicates: Lookalike[]; deleted: Lookalike[] } | null>(null);

  useEffect(() => {
    if (!activityId) return;
    let live = true;
    cc<{ activity: Record<string, unknown> }>(`/activities/${encodeURIComponent(activityId)}`)
      .then((r) => live && setForm(dbRowToFormValues(r.activity)))
      .catch((e) => live && setErr(e instanceof Error ? e.message : "Kon de activiteit niet laden."));
    return () => {
      live = false;
    };
  }, [activityId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const save = async (flags: { force?: boolean; allowDuplicate?: boolean; allowExcluded?: boolean } = {}) => {
    if (!form) return;
    setBusy(true);
    setErr(null);
    setConflictInfo(null);
    try {
      if (activityId) {
        await cc(`/activities/${encodeURIComponent(activityId)}`, { method: "PUT", body: activityFormToBody(form) });
        onSaved(activityId);
      } else {
        const r = await cc<{ id: string }>("/swipe/activities", { method: "POST", body: { activity: activityFormToBody(form), ...flags } });
        onSaved(r.id);
      }
    } catch (e) {
      if (e instanceof AdminApiError) {
        const d = (e.details ?? {}) as { code?: string; duplicates?: Lookalike[]; deleted?: Lookalike[]; rule?: string };
        if (e.status === 409 && (d.code === "duplicate" || d.code === "previously_deleted")) {
          setConflictInfo({ code: d.code, duplicates: d.duplicates ?? [], deleted: d.deleted ?? [] });
        } else if (d.code === "quality_rule") {
          setErr(`${e.message}`);
          setConflictInfo({ code: "quality_rule", duplicates: [], deleted: [] });
        } else {
          setErr(e.message);
        }
      } else {
        setErr(e instanceof Error ? e.message : "Opslaan mislukt.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-slate-900/50 p-3 sm:p-8">
      <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white shadow-2xl" role="dialog" aria-label={activityId ? "Activiteit bewerken" : "Activiteit toevoegen"}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-bold text-slate-900">{activityId ? "Activiteit bewerken" : "Activiteit toevoegen"}</h2>
          <Btn variant="ghost" onClick={onClose} disabled={busy}>✕ Sluiten</Btn>
        </header>
        <div className="p-5">
          {!form && !err && <Loading />}
          {conflictInfo && (
            <div className="mb-4 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-950">
              {conflictInfo.deleted.length > 0 && (
                <div>
                  <p className="font-bold">Een gelijkaardige activiteit heb je eerder verwijderd:</p>
                  <ul className="ml-4 mt-1 list-disc">
                    {conflictInfo.deleted.map((d) => (
                      <li key={d.id}>
                        {d.title} — {d.reason}{" "}
                        <button className="font-semibold underline" onClick={() => onShowDeleted(d.title)}>
                          toon in “Verwijderd” om te herstellen
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {conflictInfo.duplicates.length > 0 && (
                <div>
                  <p className="font-bold">Er bestaat al een gelijkaardige activiteit:</p>
                  <ul className="ml-4 mt-1 list-disc">
                    {conflictInfo.duplicates.map((d) => (
                      <li key={d.id}>
                        {d.title}
                        {d.city ? ` (${d.city})` : ""} — {d.reason}
                        {d.active === false ? " · niet actief" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {conflictInfo.code === "quality_rule" && (
                <p>De kwaliteitsregel zou deze activiteit normaal uitsluiten. Als eigenaar kun je hem toch toevoegen.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {conflictInfo.deleted.length > 0 && (
                  <Btn variant="danger" onClick={() => save({ allowExcluded: true, allowDuplicate: true, force: true })} loading={busy}>
                    Toch toevoegen (ik geef toestemming)
                  </Btn>
                )}
                {conflictInfo.deleted.length === 0 && conflictInfo.code === "duplicate" && (
                  <Btn variant="danger" onClick={() => save({ allowDuplicate: true, force: true })} loading={busy}>
                    Toch toevoegen als nieuwe activiteit
                  </Btn>
                )}
                {conflictInfo.code === "quality_rule" && (
                  <Btn variant="danger" onClick={() => save({ force: true })} loading={busy}>Toch toevoegen</Btn>
                )}
                <Btn onClick={() => setConflictInfo(null)}>Annuleren</Btn>
              </div>
            </div>
          )}
          {form && (
            <ActivityForm
              value={form}
              onChange={setForm}
              onSubmit={() => save()}
              onCancel={onClose}
              submitLabel={activityId ? "Opslaan" : "Toevoegen"}
              busy={busy}
              error={err}
            />
          )}
          {!form && err && <ErrorNote message={err} />}
        </div>
      </div>
    </div>
  );
}
