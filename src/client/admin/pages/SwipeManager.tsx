import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminApiError, cc } from "../api";
import { Badge, Btn, ErrorNote, Input, Loading, PageTitle, Panel, Select } from "../ui";
import { useDebounced } from "../lib";
import { SwipeCardView, type SwipeDir } from "../components/SwipeCardView";
import { ActivityEditorModal, DetailsDrawer, PurgeDialog } from "../components/SwipePanels";
import {
  DEFAULT_FILTERS,
  filtersToQuery,
  type LedgerEntry,
  type SwipeCardData,
  type SwipeFilters,
  type SwipeSummary,
} from "../components/swipe-types";

type DecideDecision = "keep" | "delete" | "later";
interface QueueRes {
  cards: SwipeCardData[];
  total: number | null;
  next: string | null;
}

const REVIEW_TABS: { id: SwipeFilters["review"]; label: string }[] = [
  { id: "unreviewed", label: "Nog niet beoordeeld" },
  { id: "keep", label: "Behouden" },
  { id: "delete", label: "Prullenbak" },
  { id: "later", label: "Later bekijken" },
  { id: "all", label: "Alles" },
];

const DIR_OF: Record<DecideDecision, SwipeDir> = { delete: "delete", keep: "keep", later: "later" };

/** Does a decision move a card out of the list the owner is looking at? */
function leavesList(review: SwipeFilters["review"], decision: DecideDecision): boolean {
  if (review === "all") return false;
  if (review === "unreviewed") return true;
  return review !== decision;
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

export function SwipeManager() {
  const [filters, setFilters] = useState<SwipeFilters>(DEFAULT_FILTERS);
  const dFilters = useDebounced(filters, 350);
  const filterKey = JSON.stringify(dFilters);

  const [cards, setCards] = useState<SwipeCardData[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [removed, setRemoved] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<SwipeSummary | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [leaving, setLeaving] = useState<{ card: SwipeCardData; dir: SwipeDir; from: { x: number; y: number }; key: number } | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ id: string | null } | null>(null);
  /** open "delete for good" dialog; ids = specific activities, undefined = the whole trash */
  const [purge, setPurge] = useState<{ ids?: string[] } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string; undoKey?: number; tone?: "error" } | null>(null);
  const [citySugg, setCitySugg] = useState<string[]>([]);
  const [orgSugg, setOrgSugg] = useState<{ value: string; label: string }[]>([]);
  const [orgText, setOrgText] = useState("");

  const keyRef = useRef(0);
  const reqGen = useRef(0);
  const lockUntil = useRef(0);
  const toastTimer = useRef<number | null>(null);
  const lightTimer = useRef<number | null>(null);
  const chain = useRef(new Map<string, Promise<void>>());

  /* ------------------------------ summary ------------------------------ */
  const loadSummary = useCallback(async () => {
    try {
      setSummary(await cc<SwipeSummary>("/swipe/summary"));
    } catch {
      /* the page still works; the progress bar just stays as it was */
    }
  }, []);
  const scheduleLight = useCallback(() => {
    if (lightTimer.current) window.clearTimeout(lightTimer.current);
    lightTimer.current = window.setTimeout(async () => {
      try {
        const r = await cc<{ keep: number; deleted: number; later: number }>("/swipe/summary?light=1");
        setSummary((s) => (s ? { ...s, keep: r.keep, deleted: r.deleted, later: r.later, unreviewed: Math.max(0, s.total - r.keep - r.deleted - r.later) } : s));
      } catch {
        /* ignore: the decisions themselves are tracked in the ledger */
      }
    }, 2500);
  }, []);
  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  /* ------------------------------- queue ------------------------------- */
  useEffect(() => {
    const gen = ++reqGen.current;
    setLoading(true);
    setLoadErr(null);
    setCards([]);
    setRemoved(0);
    cc<QueueRes>(`/swipe/queue?${filtersToQuery(dFilters)}`)
      .then((r) => {
        if (gen !== reqGen.current) return;
        setCards(r.cards);
        setNext(r.next);
        setTotal(r.total);
      })
      .catch((e) => {
        if (gen === reqGen.current) setLoadErr(e instanceof Error ? e.message : "Laden mislukt.");
      })
      .finally(() => {
        if (gen === reqGen.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, nonce]);

  const loadMore = useCallback(async () => {
    if (!next || loadingMore) return;
    const gen = reqGen.current;
    setLoadingMore(true);
    try {
      const r = await cc<QueueRes>(`/swipe/queue?${filtersToQuery(dFilters, next)}`);
      if (gen !== reqGen.current) return;
      setCards((cs) => {
        const have = new Set(cs.map((c) => c.id));
        return [...cs, ...r.cards.filter((c) => !have.has(c.id))];
      });
      setNext(r.next);
    } catch (e) {
      if (gen === reqGen.current) setLoadErr(e instanceof Error ? e.message : "Laden mislukt.");
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, loadingMore, filterKey]);

  useEffect(() => {
    if (!loading && !loadingMore && next && cards.length < 8) void loadMore();
  }, [cards.length, next, loading, loadingMore, loadMore]);

  /* ------------------------------- toast ------------------------------- */
  const showToast = useCallback((text: string, opts: { undoKey?: number; tone?: "error" } = {}) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    const id = ++keyRef.current;
    setToast({ id, text, ...opts });
    toastTimer.current = window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), opts.tone === "error" ? 9000 : 8000);
  }, []);

  /* --------------------------- saving decisions ------------------------- */
  const patchEntry = useCallback((key: number, patch: Partial<LedgerEntry>) => {
    setLedger((l) => l.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }, []);

  const send = useCallback(
    (key: number, card: SwipeCardData, decision: DecideDecision) => {
      const prev = chain.current.get(card.id) ?? Promise.resolve();
      const run = prev.then(async () => {
        try {
          const r = await cc<{ version: number }>("/swipe/decide", {
            method: "POST",
            body: { activityId: card.id, decision, expectedVersion: card.version },
          });
          // an older failed/conflicting attempt for this activity is resolved by this one
          setLedger((l) =>
            l
              .filter((e) => !(e.activityId === card.id && e.key !== key && (e.status === "failed" || e.status === "conflict")))
              .map((e) => (e.key === key ? { ...e, status: "saved" as const, version: r.version, error: undefined } : e)),
          );
          scheduleLight();
          if (decision === "delete") showToast(`“${card.title}” staat nu in de prullenbak`, { undoKey: key });
        } catch (e) {
          if (e instanceof AdminApiError && e.status === 409 && (e.details as { code?: string } | undefined)?.code === "version_conflict") {
            patchEntry(key, { status: "conflict", error: e.message });
            // show the activity again as it is now, so the owner decides on the real state
            try {
              const f = await cc<{ card: SwipeCardData }>(`/swipe/activity/${encodeURIComponent(card.id)}`);
              setCards((cs) => [f.card, ...cs.filter((c) => c.id !== f.card.id)]);
            } catch {
              /* stays flagged in the ledger */
            }
          } else {
            patchEntry(key, { status: "failed", error: e instanceof Error ? e.message : "Opslaan mislukt." });
          }
        }
      });
      chain.current.set(card.id, run);
    },
    [patchEntry, scheduleLight, showToast],
  );

  const decideCard = useCallback(
    (card: SwipeCardData, decision: DecideDecision, from?: { x: number; y: number }) => {
      if (Date.now() < lockUntil.current) return;
      lockUntil.current = Date.now() + 160;
      const key = ++keyRef.current;
      setLedger((l) => [{ key, activityId: card.id, title: card.title, decision, status: "saving" as const, card }, ...l].slice(0, 80));
      setCards((cs) => cs.filter((c) => c.id !== card.id));
      if (leavesList(dFilters.review, decision)) setRemoved((n) => n + 1);
      setLeaving({ card, dir: DIR_OF[decision], from: from ?? { x: 0, y: 0 }, key });
      window.setTimeout(() => setLeaving((l) => (l?.key === key ? null : l)), 320);
      send(key, card, decision);
    },
    [dFilters.review, send],
  );

  const retry = (e: LedgerEntry) => {
    patchEntry(e.key, { status: "saving", error: undefined });
    send(e.key, e.card, e.decision);
  };
  const dismiss = (key: number) => setLedger((l) => l.filter((e) => e.key !== key));

  /* -------------------------------- undo -------------------------------- */
  const reofferCard = useCallback(async (id: string) => {
    const f = await cc<{ card: SwipeCardData }>(`/swipe/activity/${encodeURIComponent(id)}`);
    setCards((cs) => [f.card, ...cs.filter((c) => c.id !== f.card.id)]);
  }, []);

  const undoActivity = useCallback(
    async (activityId: string, version: number, ledgerKey?: number) => {
      try {
        await cc("/swipe/undo", { method: "POST", body: { activityId, expectedVersion: version } });
        if (ledgerKey) patchEntry(ledgerKey, { undone: true });
        await reofferCard(activityId);
        setRemoved((n) => Math.max(0, n - 1));
        scheduleLight();
        showToast("Beslissing ongedaan gemaakt");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Ongedaan maken mislukt.", { tone: "error" });
      }
    },
    [patchEntry, reofferCard, scheduleLight, showToast],
  );

  const undoLast = useCallback(async () => {
    if (ledger.some((e) => e.status === "saving")) {
      showToast("Even geduld: de vorige beslissing wordt nog opgeslagen…");
      return;
    }
    const e = ledger.find((x) => x.status === "saved" && !x.undone && x.version);
    if (e?.version) return undoActivity(e.activityId, e.version, e.key);
    try {
      const r = await cc<{ items: { activityId: string; undoable: boolean; currentVersion: number }[] }>("/swipe/recent");
      const it = r.items.find((i) => i.undoable);
      if (!it) return showToast("Niets om ongedaan te maken.");
      return undoActivity(it.activityId, it.currentVersion);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Ongedaan maken mislukt.", { tone: "error" });
    }
  }, [ledger, showToast, undoActivity]);

  /* ------------------------ drawer / editor actions --------------------- */
  const decideFromDrawer = (card: SwipeCardData, decision: DecideDecision) => {
    setDetails(null);
    setCards((cs) => cs.filter((c) => c.id !== card.id));
    lockUntil.current = 0;
    decideCard(card, decision);
  };
  const toggleReresearch = async (card: SwipeCardData, on: boolean) => {
    try {
      await cc("/swipe/reresearch", { method: "POST", body: { activityId: card.id, expectedVersion: card.version, on } });
      showToast(on ? "Opnieuw onderzoeken gevraagd" : "Verzoek ingetrokken");
      setDetails(null);
      void loadSummary();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Mislukt.", { tone: "error" });
    }
  };
  const afterEdit = async (id: string) => {
    setEditor(null);
    try {
      const f = await cc<{ card: SwipeCardData }>(`/swipe/activity/${encodeURIComponent(id)}`);
      setCards((cs) => (cs.some((c) => c.id === id) ? cs.map((c) => (c.id === id ? f.card : c)) : cs));
      showToast("Opgeslagen");
    } catch {
      showToast("Opgeslagen (kaart kon niet ververst worden)");
    }
    void loadSummary();
  };

  const afterPurge = (n: number) => {
    setPurge(null);
    setDetails(null);
    setNonce((x) => x + 1); // reload the list: the purged cards are gone
    void loadSummary();
    if (n > 0) showToast(`${n} ${n === 1 ? "activiteit" : "activiteiten"} definitief verwijderd`);
  };

  /* ------------------------------ keyboard ------------------------------ */
  const current = cards[0] ?? null;
  const modalOpen = details !== null || editor !== null || purge !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || modalOpen) return;
      const mod = e.metaKey || e.altKey;
      if (mod) return;
      const k = e.key;
      const isUndo = k === "Backspace" || ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "z") || (!e.ctrlKey && k.toLowerCase() === "z");
      if (e.ctrlKey && !isUndo) return;
      if (isUndo) {
        e.preventDefault();
        if (!e.repeat) void undoLast();
        return;
      }
      if (e.repeat) {
        if (k.startsWith("Arrow")) e.preventDefault();
        return;
      }
      if (!current) return;
      if (k === "ArrowLeft") {
        e.preventDefault();
        if (!current.deleted) decideCard(current, "delete");
      } else if (k === "ArrowRight") {
        e.preventDefault();
        decideCard(current, "keep");
      } else if (k === "ArrowUp") {
        e.preventDefault();
        if (!current.deleted) decideCard(current, "later");
      } else if (k === "i" || k === "Enter") {
        e.preventDefault();
        setDetails(current.id);
      } else if (k === "e") {
        e.preventDefault();
        setEditor({ id: current.id });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, modalOpen, decideCard, undoLast]);

  /* ------------------------ never lose an unsaved decision -------------- */
  const saving = ledger.filter((e) => e.status === "saving").length;
  const unsaved = ledger.filter((e) => e.status === "failed" || e.status === "conflict");
  const savedCount = ledger.filter((e) => e.status === "saved" && !e.undone).length;
  useEffect(() => {
    if (saving === 0 && unsaved.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving, unsaved.length]);

  /* ---------------------------- type-ahead filters ---------------------- */
  const cityQ = useDebounced(filters.city, 250);
  useEffect(() => {
    if (cityQ.length < 2) return setCitySugg([]);
    cc<{ items: { value: string }[] }>(`/swipe/suggest?kind=city&q=${encodeURIComponent(cityQ)}`)
      .then((r) => setCitySugg(r.items.map((i) => i.value)))
      .catch(() => setCitySugg([]));
  }, [cityQ]);
  const orgQ = useDebounced(orgText, 250);
  useEffect(() => {
    if (orgQ.length < 2) return setOrgSugg([]);
    cc<{ items: { value: string; label: string }[] }>(`/swipe/suggest?kind=org&q=${encodeURIComponent(orgQ)}`)
      .then((r) => setOrgSugg(r.items))
      .catch(() => setOrgSugg([]));
  }, [orgQ]);

  const set = <K extends keyof SwipeFilters>(k: K, v: SwipeFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const onOrgText = (v: string) => {
    setOrgText(v);
    const hit = orgSugg.find((o) => o.label === v);
    if (hit) setFilters((f) => ({ ...f, org: hit.value, orgLabel: hit.label }));
    else if (!v) setFilters((f) => ({ ...f, org: "", orgLabel: "" }));
  };

  const activeFilters = [filters.research !== "any", filters.visibility !== "active", !!filters.category, !!filters.city, !!filters.org, !!filters.email.trim(), !!filters.q.trim()].filter(Boolean).length;
  const remaining = total == null ? null : Math.max(0, total - removed);
  const tabCount = (id: SwipeFilters["review"]): number | null => {
    if (!summary) return null;
    return id === "unreviewed" ? summary.unreviewed : id === "keep" ? summary.keep : id === "delete" ? summary.deleted : id === "later" ? summary.later : summary.total;
  };
  const front = leaving ? null : current;
  const peek = cards[leaving ? 0 : 1] ?? null;

  const showDeletedFor = (title: string) => {
    setEditor(null);
    setOrgText("");
    setFilters({ ...DEFAULT_FILTERS, review: "delete", visibility: "all", q: title });
  };

  const statusBanner = useMemo(() => {
    if (unsaved.length) return { tone: "bg-rose-50 text-rose-800 ring-rose-300", text: `${unsaved.length} beslissing(en) NIET opgeslagen` };
    if (saving) return { tone: "bg-amber-50 text-amber-800 ring-amber-300", text: `Opslaan… (${saving})` };
    if (savedCount) return { tone: "bg-emerald-50 text-emerald-800 ring-emerald-300", text: `Alles opgeslagen in de database ✓ (${savedCount})` };
    return { tone: "bg-slate-50 text-slate-600 ring-slate-200", text: "Nog geen beslissingen" };
  }, [saving, savedCount, unsaved.length]);

  return (
    <>
      <PageTitle
        title="Swipe Manager"
        right={
          <div className="flex gap-2">
            <Btn onClick={() => void loadSummary()} aria-label="Vernieuwen"><span aria-hidden>↻</span><span className="hidden sm:inline">Vernieuwen</span></Btn>
            <Btn variant="primary" onClick={() => setEditor({ id: null })}>＋<span className="hidden sm:inline">&nbsp;Activiteit toevoegen</span><span className="sm:hidden">&nbsp;Toevoegen</span></Btn>
          </div>
        }
      />

      {/* progress */}
      <Panel className="mb-3" bodyClassName="p-3 sm:p-4">
        {summary ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-[12.5px] text-slate-700 sm:gap-x-5 sm:text-[13px]">
              <span><b className="text-slate-900">{summary.total.toLocaleString("nl-BE")}</b> activiteiten totaal</span>
              <span><b className="text-slate-900">{summary.unreviewed.toLocaleString("nl-BE")}</b> nog te beoordelen</span>
              <span className="text-emerald-700"><b>{summary.keep.toLocaleString("nl-BE")}</b> behouden</span>
              <span className="text-rose-700"><b>{summary.deleted.toLocaleString("nl-BE")}</b> in de prullenbak</span>
              <span className="text-amber-700"><b>{summary.later.toLocaleString("nl-BE")}</b> later bekijken</span>
              <span className="hidden text-slate-500 sm:inline">{summary.unresearched.toLocaleString("nl-BE")} nog niet onderzocht · {summary.manual.toLocaleString("nl-BE")} handmatige controle{summary.purged > 0 ? ` · ${summary.purged.toLocaleString("nl-BE")} definitief gewist` : ""}</span>
            </div>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={summary.total - summary.unreviewed} aria-valuemax={summary.total}>
              <div className="bg-emerald-500 transition-all" style={{ width: `${(summary.keep / Math.max(1, summary.total)) * 100}%` }} />
              <div className="bg-rose-500 transition-all" style={{ width: `${(summary.deleted / Math.max(1, summary.total)) * 100}%` }} />
              <div className="bg-amber-400 transition-all" style={{ width: `${(summary.later / Math.max(1, summary.total)) * 100}%` }} />
            </div>
          </>
        ) : (
          <Loading label="Voortgang laden…" />
        )}
      </Panel>

      {/* filters: the review tabs are always visible, the rest sits behind one button */}
      <Panel className="mb-3" bodyClassName="p-2.5 sm:p-3">
        <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Beoordeling">
          {REVIEW_TABS.map((t) => {
            const on = filters.review === t.id;
            const n = tabCount(t.id);
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                onClick={() => set("review", t.id)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${on ? "bg-brand-500 text-white shadow" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                {t.label}
                {n != null && <span className={`ml-1.5 text-[11px] ${on ? "text-white/80" : "text-slate-500"}`}>{n.toLocaleString("nl-BE")}</span>}
              </button>
            );
          })}
        </div>
          <Btn onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} className="shrink-0">
            ⚙ Filters{activeFilters > 0 && <span className="ml-1 rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">{activeFilters}</span>}
          </Btn>
        </div>
        {showFilters && (
        <div className="mt-2.5 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          <Select value={filters.research} onChange={(e) => set("research", e.target.value as SwipeFilters["research"])} aria-label="Onderzoek">
            <option value="any">Onderzoek: alle</option>
            <option value="unresearched">Nog niet onderzocht</option>
            <option value="researched">Al onderzocht</option>
            <option value="manual">Handmatige controle nodig</option>
          </Select>
          <Select value={filters.visibility} onChange={(e) => set("visibility", e.target.value as SwipeFilters["visibility"])} aria-label="Zichtbaarheid">
            <option value="active">Alleen actieve</option>
            <option value="hidden">Alleen verborgen (audit)</option>
            <option value="all">Actief + verborgen</option>
          </Select>
          <Select value={filters.category} onChange={(e) => set("category", e.target.value)} aria-label="Categorie">
            <option value="">Alle categorieën</option>
            {summary?.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
          <div>
            <Input list="swipe-cities" placeholder="Locatie / plaats" value={filters.city} onChange={(e) => set("city", e.target.value)} className="w-full" aria-label="Plaats" />
            <datalist id="swipe-cities">{citySugg.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <Input list="swipe-orgs" placeholder="Organisatie" value={orgText} onChange={(e) => onOrgText(e.target.value)} className="w-full" aria-label="Organisatie" />
            <datalist id="swipe-orgs">{orgSugg.map((o) => <option key={o.value} value={o.label} />)}</datalist>
          </div>
          <Input placeholder="E-mailadres" value={filters.email} onChange={(e) => set("email", e.target.value)} aria-label="E-mailadres" />
          <Input placeholder="Zoek op naam…" value={filters.q} onChange={(e) => set("q", e.target.value)} aria-label="Zoeken" />
        </div>
        )}
      </Panel>

      {filters.review === "delete" && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-950">
          <span>
            🗑 <b>Prullenbak.</b> Wat je verwijdert staat hier en kan altijd hersteld worden. <b>Legen wist het definitief.</b>
          </span>
          <Btn variant="danger" disabled={(summary?.deleted ?? 0) === 0} onClick={() => setPurge({})}>
            Prullenbak legen…
          </Btn>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ------------------------------ card area ----------------------------- */}
        <div>
          <div className="mx-auto mb-2 flex max-w-xl items-center justify-between gap-2 text-[12px] text-slate-500">
            <span className="shrink-0">
              {remaining != null ? <><b className="text-slate-800">{remaining.toLocaleString("nl-BE")}</b> in deze lijst</> : "…"}
              {loadingMore && <span className="ml-2">meer laden…</span>}
            </span>
            <span className={`min-w-0 truncate rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ${statusBanner.tone}`} role="status" aria-live="polite" title={statusBanner.text}>
              {statusBanner.text}
            </span>
          </div>

          <div className="relative mx-auto h-[clamp(420px,calc(100dvh-21rem),680px)] w-full max-w-xl">
            {loading && <div className="absolute inset-0 grid place-items-center rounded-3xl bg-white ring-1 ring-slate-200"><Loading label="Activiteiten laden…" /></div>}
            {!loading && loadErr && <div className="absolute inset-0 grid place-items-center rounded-3xl bg-white p-6 ring-1 ring-slate-200"><div className="space-y-3"><ErrorNote message={loadErr} /><Btn onClick={() => setFilters((f) => ({ ...f }))}>Opnieuw proberen</Btn></div></div>}
            {!loading && !loadErr && !current && !leaving && (
              <div className="absolute inset-0 grid place-items-center rounded-3xl bg-white p-8 text-center ring-1 ring-slate-200">
                {loadingMore || next ? (
                  <Loading label="Volgende activiteiten laden…" />
                ) : (
                  <div>
                    <p className="text-4xl">🎉</p>
                    <h3 className="mt-2 text-lg font-bold text-slate-900">Deze lijst is klaar</h3>
                    <p className="mt-1 text-sm text-slate-500">Er zijn geen activiteiten meer voor deze filters.</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <Btn onClick={() => set("review", "later")}>Bekijk “Later bekijken”</Btn>
                      <Btn onClick={() => set("review", "delete")}>Bekijk “Prullenbak”</Btn>
                      <Btn onClick={() => set("review", "keep")}>Bekijk “Behouden”</Btn>
                    </div>
                  </div>
                )}
              </div>
            )}
            {!loading && peek && <SwipeCardView key={`peek-${peek.id}`} card={peek} interactive={false} stackDepth={1} />}
            {leaving && <SwipeCardView key={`leave-${leaving.key}`} card={leaving.card} interactive={false} exiting={{ dir: leaving.dir, from: leaving.from }} />}
            {!loading && front && (
              <SwipeCardView
                key={front.id}
                card={front}
                onDecide={(dir, from) => {
                  if (dir === "delete") {
                    if (front.deleted) return;
                    decideCard(front, "delete", from);
                  } else if (dir === "keep") decideCard(front, "keep", from);
                  else if (!front.deleted) decideCard(front, "later", from);
                }}
                onDetails={() => setDetails(front.id)}
              />
            )}
          </div>

          {/* buttons */}
          <div className="mx-auto mt-4 grid max-w-xl grid-cols-3 gap-2 sm:grid-cols-6">
            <Btn onClick={() => void undoLast()} className="justify-center py-2.5" title="Backspace">↶ Terug</Btn>
            <Btn variant="danger" disabled={!current || current.deleted} onClick={() => current && decideCard(current, "delete")} className="justify-center py-2.5" title="Pijl links">🗑 Verwijderen</Btn>
            {current?.deleted ? (
              <Btn variant="danger" onClick={() => setPurge({ ids: [current.id] })} className="justify-center py-2.5" title="Definitief verwijderen">🔥 Definitief</Btn>
            ) : (
              <Btn disabled={!current} onClick={() => current && decideCard(current, "later")} className="justify-center py-2.5" title="Pijl omhoog">⏭ Later</Btn>
            )}
            <Btn variant="primary" disabled={!current} onClick={() => current && decideCard(current, "keep")} className="justify-center py-2.5" title="Pijl rechts">{current?.deleted ? "↩ Herstellen" : "✓ Bewaren"}</Btn>
            <Btn disabled={!current} onClick={() => current && setDetails(current.id)} className="justify-center py-2.5" title="i">ⓘ Details</Btn>
            <Btn disabled={!current} onClick={() => current && setEditor({ id: current.id })} className="justify-center py-2.5" title="e">✎ Bewerken</Btn>
          </div>
          <p className="mx-auto mt-2 hidden max-w-xl text-center text-[11.5px] text-slate-400 sm:block">← verwijderen · → behouden · ↑ later · Backspace terug · i details · e bewerken</p>
        </div>

        {/* -------------------------------- ledger ------------------------------- */}
        <Panel title="Laatste beslissingen" subtitle="Elke beslissing blijft hier staan tot de server ze bevestigd heeft." bodyClassName="p-0">
          {ledger.length === 0 ? (
            <p className="p-4 text-[13px] text-slate-500">Nog niets beslist. Je beslissingen worden meteen opgeslagen in de centrale database.</p>
          ) : (
            <ul className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
              {ledger.slice(0, 40).map((e) => (
                <li key={e.key} className="flex items-start gap-2 px-3 py-2 text-[12.5px]">
                  <span className="mt-0.5 text-base" aria-hidden>{e.decision === "keep" ? "✅" : e.decision === "delete" ? "🗑️" : "⏭️"}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium ${e.undone ? "text-slate-400 line-through" : "text-slate-800"}`}>{e.title}</p>
                    <p className="text-[11.5px] text-slate-500">
                      {e.decision === "keep" ? (e.card.deleted ? "hersteld" : "behouden") : e.decision === "delete" ? "naar de prullenbak" : "later bekijken"}
                      {" · "}
                      {e.status === "saving" && <span className="text-amber-700">opslaan…</span>}
                      {e.status === "saved" && !e.undone && <span className="text-emerald-700">opgeslagen ✓</span>}
                      {e.undone && <span>ongedaan gemaakt</span>}
                      {e.status === "failed" && <span className="font-semibold text-rose-700">NIET opgeslagen</span>}
                      {e.status === "conflict" && <span className="font-semibold text-rose-700">niet toegepast: elders gewijzigd</span>}
                    </p>
                    {(e.status === "failed" || e.status === "conflict") && e.error && <p className="mt-0.5 text-[11.5px] text-rose-700">{e.error}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {e.status === "failed" && <Btn variant="danger" onClick={() => retry(e)} className="px-2 py-1 text-xs">Opnieuw</Btn>}
                    {(e.status === "failed" || e.status === "conflict") && <Btn variant="ghost" onClick={() => dismiss(e.key)} className="px-2 py-1 text-xs" aria-label="Verbergen">✕</Btn>}
                    {e.status === "saved" && !e.undone && e.version && (
                      <Btn variant="ghost" onClick={() => void undoActivity(e.activityId, e.version!, e.key)} className="px-2 py-1 text-xs">↶</Btn>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-100 px-3 py-2 text-[11.5px] text-slate-500">
            <Badge tone="blue">Tip</Badge> Behouden is jouw keuze, niet de technische verificatie. Wat in de prullenbak staat verdwijnt overal en wordt door geen enkel proces teruggezet. Pas "Prullenbak legen" wist het definitief.
          </div>
        </Panel>
      </div>

      {/* undo toast */}
      {toast && (
        <div className={`fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2.5 text-[13px] font-medium text-white shadow-2xl ${toast.tone === "error" ? "bg-rose-700" : "bg-slate-900"}`} role="status">
          <span>{toast.text}</span>
          {toast.undoKey != null && (() => {
            const e = ledger.find((x) => x.key === toast.undoKey);
            return e?.version && !e.undone ? (
              <button className="rounded-md bg-white/15 px-2.5 py-1 font-semibold hover:bg-white/25" onClick={() => { setToast(null); void undoActivity(e.activityId, e.version!, e.key); }}>
                Ongedaan maken
              </button>
            ) : null;
          })()}
        </div>
      )}

      {details && (
        <DetailsDrawer
          id={details}
          onClose={() => setDetails(null)}
          onDecide={decideFromDrawer}
          onEdit={(c) => { setDetails(null); setEditor({ id: c.id }); }}
          onReresearch={toggleReresearch}
          onPurge={(c) => setPurge({ ids: [c.id] })}
        />
      )}
      {purge && <PurgeDialog ids={purge.ids} onClose={() => setPurge(null)} onDone={afterPurge} />}
      {editor && (
        <ActivityEditorModal
          activityId={editor.id}
          onClose={() => setEditor(null)}
          onSaved={(id) => void afterEdit(id)}
          onShowDeleted={showDeletedFor}
        />
      )}
    </>
  );
}

