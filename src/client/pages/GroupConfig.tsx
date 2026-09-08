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
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [group, setGroup] = useState<GroupDTO | null>(null);
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { group } = await api<{ group: GroupDTO }>(`/groups/${id}`);
        setGroup(group);
        if (group.settings) setDraft({ ...DEFAULT_DRAFT, ...group.settings });
      } catch (e) {
        setErr(e instanceof ApiRequestError ? e.message : "Could not load group.");
      } finally {
        setLoading(false);
      }
    })();
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
      setErr(e instanceof ApiRequestError ? e.message : "Could not save.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const startSwiping = async () => {
    const ok = await save();
    if (!ok) return;
    setStarting(true);
    setErr(null);
    try {
      await api(`/groups/${id}/start`, { method: "POST", body: {} });
      nav(`/groups/${id}/swipe`, { replace: true });
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : "Could not start.");
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

  if (loading) return <LoadingScreen />;
  if (!group) return <ErrorState message={err ?? "Group not found."} />;
  if (!group.isCreator)
    return (
      <ErrorState
        title="Creator only"
        message="Only the group creator can change the setup. Ask them to start the swipe."
      />
    );

  return (
    <div className="space-y-7 pb-40">
      <PageHeader
        back={{ to: `/groups/${id}`, label: group.name }}
        title="Set the vibe"
        subtitle="What, where and when. You can change this before you start swiping."
      />

      <InviteBox code={group.inviteCode} url={group.inviteUrl} />

      {/* categories */}
      <section>
        <h2 className="mb-2 font-bold">What kind of activities?</h2>
        <label className="mb-3 flex items-center gap-3 rounded-2xl bg-paper-soft p-3">
          <input
            type="checkbox"
            className="h-5 w-5 accent-brand-500"
            checked={draft.allActivities}
            onChange={(e) =>
              setDraft((d) => ({ ...d, allActivities: e.target.checked }))
            }
          />
          <span className="font-semibold">All activities</span>
          <span className="text-sm text-navy-400">— don’t restrict by category</span>
        </label>
        <div
          className={`flex flex-wrap gap-2 ${draft.allActivities ? "pointer-events-none opacity-40" : ""}`}
        >
          {ACTIVITY_CATEGORIES.map((c) => (
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
        <h2 className="font-bold">Where?</h2>
        <Field
          label="City or postcode"
          placeholder="Antwerpen"
          value={draft.locationLabel ?? ""}
          onChange={(e) =>
            setDraft((d) => ({ ...d, locationLabel: e.target.value }))
          }
        />
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-navy-700">
            Radius
          </span>
          <div className="flex flex-wrap gap-2">
            {RADIUS_OPTIONS_KM.map((r) => (
              <button
                key={r}
                type="button"
                className={draft.radiusKm === r ? "chip-on" : "chip"}
                onClick={() => setDraft((d) => ({ ...d, radiusKm: r }))}
              >
                Within {r} km
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* budget */}
      <section>
        <h2 className="mb-2 font-bold">Budget per person</h2>
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
        <h2 className="mb-2 font-bold">When?</h2>
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
          🤷 We don’t know when yet
          <span className="block text-sm font-normal text-navy-400">
            VIBIN runs a quick date vote after you match an activity.
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
          <h2 className="mb-2 font-bold">Time of day (optional)</h2>
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

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-paper-line bg-paper-card/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
        <Button
          className="w-full"
          loading={starting || saving}
          disabled={!canStart}
          onClick={startSwiping}
        >
          Save &amp; start swiping →
        </Button>
        <button
          type="button"
          className="mt-1.5 w-full py-1.5 text-center text-sm font-medium text-navy-500 hover:text-navy"
          onClick={async () => {
            if (await save()) nav(`/groups/${id}`);
          }}
        >
          Save and come back later
        </button>
        {!canStart && (
          <p className="mt-1 text-center text-xs text-navy-400">
            Pick at least one category, or choose “All activities”.
          </p>
        )}
      </div>
    </div>
  );
}
