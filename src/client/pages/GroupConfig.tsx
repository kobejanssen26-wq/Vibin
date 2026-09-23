import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiRequestError } from "../lib/api";
import { Button, ErrorState, Field, LoadingScreen } from "../components/ui";
import { InviteBox } from "../components/InviteBox";
import { PageHeader } from "../components/PageHeader";
import type { GroupDTO, GroupSettingsDTO } from "@shared/types";
import {
  ACTIVITY_CATEGORIES,
  BUDGET_BANDS,
  DATE_MODES,
  RADIUS_OPTIONS_KM,
  TIME_BANDS,
} from "@shared/constants";
import { useLang } from "../lib/i18n";

type Draft = GroupSettingsDTO;

const DEFAULT_DRAFT: Draft = {
  categories: [],
  allActivities: true,
  locationLabel: "",
  lat: null,
  lng: null,
  radiusKm: 25,
  budgetBand: "any",
  dateMode: "unknown",
  dateSpecific: null,
  timeBand: "unknown",
  timeSpecific: null,
  dateKnown: false,
};

export function GroupConfig() {
  const { t } = useLang();
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [group, setGroup] = useState<GroupDTO | null>(null);
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);

  const [categories, setCategories] = useState(ACTIVITY_CATEGORIES);
  useEffect(() => {
    (async () => {
      try {
        const { group } = await api<{ group: GroupDTO }>(`/groups/${id}`);
        setGroup(group);
        if (group.settings) setDraft({ ...DEFAULT_DRAFT, ...group.settings });
      } catch (e) {
        setErr(e instanceof ApiRequestError ? e.message : t("config.loadError"));
      } finally {
        setLoading(false);
      }
    })();
    // Falls back to the fixed constant (already set as initial state) if this
    // fails — filters must never break just because this call did.
    api<{ categories: typeof ACTIVITY_CATEGORIES }>("/categories")
      .then((r) => r.categories.length && setCategories(r.categories))
      .catch(() => {});
  }, [id]);

  const save = async (): Promise<boolean> => {
    setSaving(true);
    setErr(null);
    try {
      const { group } = await api<{ group: GroupDTO }>(`/groups/${id}/settings`, {
        method: "PUT",
        body: {
          categories: draft.allActivities ? [] : draft.categories,
          allActivities: draft.allActivities,
          locationLabel: draft.locationLabel || null,
          lat: draft.lat,
          lng: draft.lng,
          radiusKm: draft.radiusKm,
          budgetBand: draft.budgetBand,
          dateMode: draft.dateMode,
          dateSpecific: draft.dateSpecific,
          timeBand: draft.timeBand,
          timeSpecific: draft.timeSpecific,
        },
      });
      setGroup(group);
      return true;
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : t("config.saveError"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Editing filters mid-swipe: the group is already "swiping", so we just save
  // (the server rebuilds the unswiped tail of the deck) and go back.
  const midSwipe = group?.status === "swiping";

  const startSwiping = async () => {
    const ok = await save();
    if (!ok) return;
    if (midSwipe) {
      nav(`/groups/${id}/swipe`, { replace: true });
      return;
    }
    setStarting(true);
    setErr(null);
    try {
      await api(`/groups/${id}/start`, { method: "POST", body: {} });
      nav(`/groups/${id}/swipe`, { replace: true });
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : t("config.startError"));
      setStarting(false);
    }
  };

  const toggleCat = (c: string) =>
    setDraft((d) => ({
      ...d,
      categories: d.categories.includes(c as never)
        ? d.categories.filter((x) => x !== c)
        : [...d.categories, c as never],
    }));

  const canStart = useMemo(
    () => draft.allActivities || draft.categories.length > 0,
    [draft],
  );

  // Ask the server (which has the full Belgian geocoder) whether the typed
  // place can be placed, so the "radius won't apply" hint is accurate. Debounced.
  const [placeResolved, setPlaceResolved] = useState<boolean | null>(null);
  useEffect(() => {
    const label = draft.locationLabel?.trim();
    if (!label) {
      setPlaceResolved(null);
      return;
    }
    const t = setTimeout(() => {
      api<{ lat: number; lng: number } | null>(
        `/geo/resolve?q=${encodeURIComponent(label)}`,
      )
        .then((hit) => setPlaceResolved(hit != null))
        .catch(() => setPlaceResolved(null));
    }, 350);
    return () => clearTimeout(t);
  }, [draft.locationLabel]);

  if (loading) return <LoadingScreen />;
  if (!group) return <ErrorState message={err ?? t("config.notFound")} />;
  if (!group.isCreator)
    return (
      <ErrorState
        title={t("config.creatorOnlyTitle")}
        message={t("config.creatorOnlyBody")}
      />
    );

  return (
    <div className="mx-auto w-full max-w-xl space-y-7 pb-40">
      <PageHeader
        back={
          midSwipe
            ? { to: `/groups/${id}/swipe`, label: t("config.backSwiping") }
            : { to: `/groups/${id}`, label: group.name }
        }
        title={midSwipe ? t("config.titleMidSwipe") : t("config.titleFresh")}
        subtitle={
          midSwipe
            ? t("config.subtitleMidSwipe")
            : t("config.subtitleFresh")
        }
      />

      <InviteBox code={group.inviteCode} url={group.inviteUrl} />

      {/* categories */}
      <section>
        <h2 className="mb-2 font-bold">{t("config.categoriesTitle")}</h2>
        <label className="mb-3 flex items-center gap-3 rounded-2xl bg-paper-soft p-3">
          <input
            type="checkbox"
            className="h-5 w-5 accent-brand-500"
            checked={draft.allActivities}
            onChange={(e) =>
              setDraft((d) => ({ ...d, allActivities: e.target.checked }))
            }
          />
          <span className="font-semibold">{t("config.allActivities")}</span>
          <span className="text-sm text-navy-400">{t("config.allActivitiesHint")}</span>
        </label>
        <div
          className={`flex flex-wrap gap-2 ${draft.allActivities ? "pointer-events-none opacity-40" : ""}`}
        >
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={draft.categories.includes(c.id as never) ? "chip-on" : "chip"}
              onClick={() => toggleCat(c.id)}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </section>

      {/* location */}
      <section className="space-y-3">
        <h2 className="font-bold">{t("config.whereTitle")}</h2>
        <Field
          label={t("config.cityLabel")}
          placeholder="Antwerpen"
          value={draft.locationLabel ?? ""}
          onChange={(e) =>
            setDraft((d) => ({ ...d, locationLabel: e.target.value }))
          }
        />
        {placeResolved === false && (
          <p className="text-xs text-navy-400">
            {t("config.placeUnresolved")}
          </p>
        )}
        <div className={placeResolved === false ? "opacity-50" : ""}>
          <span className="mb-1.5 block text-sm font-semibold text-navy-700">
            {t("config.radius")}
          </span>
          <div className="flex flex-wrap gap-2">
            {RADIUS_OPTIONS_KM.map((r) => (
              <button
                key={r}
                type="button"
                className={draft.radiusKm === r ? "chip-on" : "chip"}
                onClick={() => setDraft((d) => ({ ...d, radiusKm: r }))}
              >
                {t("config.within", { km: r })}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* budget */}
      <section>
        <h2 className="mb-2 font-bold">{t("config.budgetTitle")}</h2>
        <div className="flex flex-wrap gap-2">
          {BUDGET_BANDS.map((b) => (
            <button
              key={b.id}
              type="button"
              className={draft.budgetBand === b.id ? "chip-on" : "chip"}
              onClick={() => setDraft((d) => ({ ...d, budgetBand: b.id }))}
            >
              {b.label}
            </button>
          ))}
        </div>
      </section>

      {/* date */}
      <section>
        <h2 className="mb-2 font-bold">{t("config.whenTitle")}</h2>
        <button
          type="button"
          onClick={() =>
            setDraft((d) => ({ ...d, dateMode: "unknown", dateSpecific: null }))
          }
          className={`mb-3 w-full rounded-2xl border-2 p-3.5 text-left font-semibold transition ${
            draft.dateMode === "unknown"
              ? "border-brand-500 bg-brand-500/5"
              : "border-paper-line hover:border-brand-300"
          }`}
        >
          {t("config.dontKnowYet")}
          <span className="block text-sm font-normal text-navy-400">
            {t("config.dontKnowYetHint")}
          </span>
        </button>
        <div className="flex flex-wrap gap-2">
          {DATE_MODES.filter((d) => d.id !== "unknown").map((d) => (
            <button
              key={d.id}
              type="button"
              className={draft.dateMode === d.id ? "chip-on" : "chip"}
              onClick={() => setDraft((s) => ({ ...s, dateMode: d.id }))}
            >
              {d.label}
            </button>
          ))}
        </div>
        {draft.dateMode === "specific" && (
          <input
            type="datetime-local"
            className="field mt-3"
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                dateSpecific: e.target.value
                  ? Math.floor(new Date(e.target.value).getTime() / 1000)
                  : null,
              }))
            }
          />
        )}
      </section>

      {/* time */}
      {draft.dateMode !== "unknown" && (
        <section>
          <h2 className="mb-2 font-bold">{t("config.timeTitle")}</h2>
          <div className="flex flex-wrap gap-2">
            {TIME_BANDS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={draft.timeBand === t.id ? "chip-on" : "chip"}
                onClick={() => setDraft((d) => ({ ...d, timeBand: t.id }))}
              >
                {t.label}
              </button>
            ))}
          </div>
          {draft.timeBand === "specific" && (
            <input
              type="time"
              className="field mt-3"
              value={draft.timeSpecific ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, timeSpecific: e.target.value || null }))
              }
            />
          )}
        </section>
      )}

      {err && (
        <p className="rounded-xl bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
          {err}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl border-t border-paper-line bg-paper-card/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
        <Button
          className="w-full"
          loading={starting || saving}
          disabled={!canStart}
          onClick={startSwiping}
        >
          {midSwipe ? t("config.applyFilters") : t("config.saveAndStart")}
        </Button>
        <button
          type="button"
          className="mt-1.5 w-full py-1.5 text-center text-sm font-medium text-navy-500 hover:text-navy"
          onClick={async () => {
            if (midSwipe) {
              nav(`/groups/${id}/swipe`);
              return;
            }
            if (await save()) nav(`/groups/${id}`);
          }}
        >
          {midSwipe ? t("config.cancel") : t("config.saveForLater")}
        </button>
        {!canStart && (
          <p className="mt-1 text-center text-xs text-navy-400">
            {t("config.pickCategoryHint")}
          </p>
        )}
      </div>
    </div>
  );
}
