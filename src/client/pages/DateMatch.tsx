import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiRequestError } from "../lib/api";
import { AvatarStack, Button, ErrorState, LoadingScreen } from "../components/ui";
import { Confetti } from "../components/Confetti";
import { PageHeader } from "../components/PageHeader";
import { IconCheck, IconPlus } from "../components/icons";
import { formatDay, formatTime } from "../lib/format";
import type { DateMatchStateDTO } from "@shared/types";

const VOTES = [
  { v: "yes", label: "Yes", cls: "bg-lime-400 text-navy" },
  { v: "maybe", label: "Maybe", cls: "bg-amber-400 text-navy" },
  { v: "no", label: "No", cls: "bg-danger-500 text-white" },
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
      <div className="relative py-20 text-center">
        <Confetti fire />
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-lime-400 text-navy shadow-lime motion-safe:animate-check-pop">
          <IconCheck size={30} />
        </span>
        <h1 className="mt-3 text-2xl font-extrabold motion-safe:animate-enter-up">
          A time everyone can make
        </h1>
        <p
          className="mt-1 text-sm text-navy-400 motion-safe:animate-enter-up"
          style={{ animationDelay: "0.08s" }}
        >
          Locking in your plan…
        </p>
        <Link
          to={`/groups/${id}/plan`}
          className="btn-primary mt-6 motion-safe:animate-enter-up"
          style={{ animationDelay: "0.16s" }}
        >
          See the plan
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ to: `/groups/${id}`, label: "Group" }}
        title="When should we go?"
        subtitle={
          <>
            For <strong className="text-navy">{state.activity.title}</strong>.
            VIBIN picks the first slot everyone can make.
          </>
        }
      />

      <div className="flex items-center gap-3">
        <AvatarStack people={state.members} />
        <span className="text-xs font-medium text-navy-400">
          {state.members.length} deciding
        </span>
      </div>

      {state.status === "no_consensus" && (
        <div className="flex gap-3 rounded-2xl border border-amber-400/40 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <span className="mt-0.5 shrink-0 font-bold">Heads up</span>
          <p>
            No slot works for everyone yet. Add another option or change a vote.
            VIBIN won't pick a time that leaves someone out.
          </p>
        </div>
      )}

      <ul className="stagger space-y-3">
        {state.options.map((o) => (
          <li
            key={o.id}
            className={`card overflow-hidden transition-[border-color,box-shadow] duration-300 ${
              o.unanimous
                ? "border-lime-400 shadow-lime ring-1 ring-lime-400"
                : ""
            }`}
          >
            <div className="flex items-center justify-between px-4 pt-3.5">
              <div>
                <p className="font-extrabold tracking-[-0.01em]">
                  {formatDay(o.startsAt)}
                </p>
                <p className="text-sm text-navy-400">{formatTime(o.startsAt)}</p>
              </div>
              {o.unanimous && (
                <span className="chip-lime motion-safe:animate-check-pop px-2.5 py-1 text-xs font-bold">
                  <IconCheck size={13} /> Works for all
                </span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5 px-4">
              {VOTES.map((btn) => (
                <button
                  key={btn.v}
                  disabled={busy}
                  onClick={() => castVote(o.id, btn.v)}
                  className={`press rounded-xl py-2.5 text-sm font-bold transition-[background-color,color,transform] disabled:opacity-60 ${
                    o.yourVote === btn.v
                      ? btn.cls
                      : "bg-paper-soft text-navy-400 hover:text-navy"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-paper-line px-4 py-2.5 text-xs font-medium text-navy-400">
              <Tally n={o.tally.yes} label="yes" dot="bg-lime-500" />
              <Tally n={o.tally.maybe} label="maybe" dot="bg-amber-400" />
              <Tally n={o.tally.no} label="no" dot="bg-danger-500" />
              {o.tally.notVoted > 0 && (
                <span className="text-navy-300">
                  {o.tally.notVoted} still to vote
                </span>
              )}
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
          <div className="mt-2.5 flex gap-2">
            <Button loading={busy} onClick={addOption} className="flex-1">
              Add option
            </Button>
            <button
              type="button"
              className="btn-outline flex-1"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-outline w-full" onClick={() => setAdding(true)}>
          <IconPlus size={16} /> Suggest another time
        </button>
      )}
    </div>
  );
}

function Tally({ n, label, dot }: { n: number; label: string; dot: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span key={n} className="inline-block motion-safe:animate-count-pop tabular-nums">
        {n}
      </span>{" "}
      {label}
    </span>
  );
}
