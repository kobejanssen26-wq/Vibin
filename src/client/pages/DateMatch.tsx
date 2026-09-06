import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiRequestError } from "../lib/api";
import { AvatarStack, Button, ErrorState, LoadingScreen } from "../components/ui";
import { Confetti } from "../components/Confetti";
import { formatDay, formatTime } from "../lib/format";
import type { DateMatchStateDTO } from "@shared/types";

const VOTES = [
  { v: "yes", label: "Yes", cls: "bg-emerald-500 text-white" },
  { v: "maybe", label: "Maybe", cls: "bg-tangerine-400 text-white" },
  { v: "no", label: "No", cls: "bg-coral-500 text-white" },
] as const;

export function DateMatch() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [state, setState] = useState<DateMatchStateDTO | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newSlot, setNewSlot] = useState("");

  const load = useCallback(async () => {
    try {
      const s = await api<DateMatchStateDTO>(`/groups/${id}/date-match`);
      setState(s);
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => clearInterval(t);
  }, [load]);

  const castVote = async (optionId: string, value: "yes" | "no" | "maybe") => {
    setBusy(true);
    try {
      const res = await api<{ completed: boolean; state: DateMatchStateDTO }>(
        `/groups/${id}/date-match/vote`,
        { method: "POST", body: { optionId, value } },
      );
      setState(res.state);
      if (res.completed) {
        setJustCompleted(true);
        setTimeout(() => nav(`/groups/${id}/plan`), 2200);
      }
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : "Vote failed.");
    } finally {
      setBusy(false);
    }
  };

  const addOption = async () => {
    if (!newSlot) return;
    setBusy(true);
    try {
      const res = await api<{ state: DateMatchStateDTO }>(
        `/groups/${id}/date-match/options`,
        {
          method: "POST",
          body: {
            startsAt: Math.floor(new Date(newSlot).getTime() / 1000),
          },
        },
      );
      setState(res.state);
      setAdding(false);
      setNewSlot("");
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : "Could not add option.");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !state) return <LoadingScreen label="Loading date vote…" />;
  if (err && !state) return <ErrorState message={err} onRetry={load} />;
  if (!state) return null;

  if (state.status === "matched" || justCompleted) {
    return (
      <div className="relative py-16 text-center">
        <Confetti fire />
        <div className="text-5xl">🎉</div>
        <h1 className="mt-2 text-2xl font-extrabold">Everyone agreed!</h1>
        <p className="mt-1 text-sm text-ink-muted">Opening your plan…</p>
        <Link to={`/groups/${id}/plan`} className="btn-primary mt-6">
          View the plan
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Link to={`/groups/${id}`} className="text-sm text-ink-muted">
          ← Group
        </Link>
        <h1 className="text-2xl font-extrabold">When should we go?</h1>
        <p className="text-sm text-ink-muted">
          For <strong>{state.activity.title}</strong>. Mingo picks the first slot
          everyone accepts.
        </p>
      </div>

      <AvatarStack people={state.members} />

      {state.status === "no_consensus" && (
        <p className="rounded-2xl bg-coral-500/10 px-4 py-3 text-sm font-medium text-coral-700">
          No slot works for everyone yet. Add another option or change a vote —
          Mingo won’t pick a time that excludes someone.
        </p>
      )}

      <ul className="space-y-3">
        {state.options.map((o) => (
          <li key={o.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold">{formatDay(o.startsAt)}</p>
                <p className="text-sm text-ink-muted">{formatTime(o.startsAt)}</p>
              </div>
              {o.unanimous && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-bold text-emerald-600">
                  Works for all
                </span>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              {VOTES.map((btn) => (
                <button
                  key={btn.v}
                  disabled={busy}
                  onClick={() => castVote(o.id, btn.v)}
                  className={`flex-1 rounded-xl py-2 text-sm font-bold transition ${
                    o.yourVote === btn.v
                      ? btn.cls
                      : "bg-paper-soft text-ink-muted"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            <div className="mt-2 flex gap-3 text-xs text-ink-muted">
              <span>✅ {o.tally.yes}</span>
              <span>🤔 {o.tally.maybe}</span>
              <span>❌ {o.tally.no}</span>
              {o.tally.notVoted > 0 && <span>· {o.tally.notVoted} to vote</span>}
            </div>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="card p-4">
          <label className="mb-1.5 block text-sm font-semibold">
            Suggest another time
          </label>
          <input
            type="datetime-local"
            className="field"
            value={newSlot}
            onChange={(e) => setNewSlot(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <Button loading={busy} onClick={addOption} className="flex-1 py-2">
              Add option
            </Button>
            <button
              className="btn-ghost flex-1 py-2"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn-ghost w-full"
          onClick={() => setAdding(true)}
        >
          + Suggest another time
        </button>
      )}
    </div>
  );
}
