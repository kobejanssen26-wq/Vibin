import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, ApiRequestError } from "../lib/api";
import { SwipeCard, type SwipeDir } from "../components/SwipeCard";
import { MatchCelebration } from "../components/MatchCelebration";
import { Button, EmptyState, ErrorState, LoadingScreen } from "../components/ui";
import type { MatchDTO, SwipeStateDTO } from "@shared/types";

export function Swipe() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [state, setState] = useState<SwipeStateDTO | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [celebrate, setCelebrate] = useState<MatchDTO | null>(null);
  const [seenMatchIds, setSeenMatchIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api<SwipeStateDTO>(`/groups/${id}/swipe`);
      setState(s);
      if (
        s.newMatch &&
        !seenMatchIds.has(s.newMatch.id) &&
        (s.status === "date_matching" || s.status === "planned")
      ) {
        // a match happened elsewhere (someone else cast the deciding vote)
        setCelebrate(s.newMatch);
        setSeenMatchIds((prev) => new Set(prev).add(s.newMatch!.id));
      }
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : "Could not load swipe.");
    } finally {
      setLoading(false);
    }
  }, [id, seenMatchIds]);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => clearInterval(t);
  }, [load]);

  const vote = async (dir: SwipeDir) => {
    if (!state || busy || state.queue.length === 0) return;
    const card = state.queue[0]!;
    setBusy(true);
    // optimistic pop
    setState({ ...state, queue: state.queue.slice(1) });
    try {
      const res = await api<{ newMatch: MatchDTO | null }>(
        `/groups/${id}/swipe`,
        { method: "POST", body: { activityId: card.activity.id, value: dir } },
      );
      if (res.newMatch && !seenMatchIds.has(res.newMatch.id)) {
        setCelebrate(res.newMatch);
        setSeenMatchIds((prev) => new Set(prev).add(res.newMatch!.id));
      }
      await load();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : "Vote failed.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    setBusy(true);
    try {
      await api(`/groups/${id}/swipe/undo`, { method: "POST", body: {} });
      await load();
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : "Nothing to undo.");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !state) return <LoadingScreen label="Shuffling the deck…" />;
  if (err && !state) return <ErrorState message={err} onRetry={load} />;
  if (!state) return null;

  if (state.status === "configuring") {
    return (
      <EmptyState
        emoji="⚙️"
        title="Not swiping yet"
        message="The group setup isn’t finished."
        action={
          <Link to={`/groups/${id}`} className="btn-ghost">
            Back to group
          </Link>
        }
      />
    );
  }

  const done = state.queue.length === 0;
  const top = state.queue[0];
  const next = state.queue[1];

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <div className="mb-3 flex items-center justify-between">
        <Link to={`/groups/${id}`} className="text-sm text-ink-muted">
          ← Group
        </Link>
        {state.currentProgress && (
          <span className="rounded-full bg-paper-soft px-3 py-1 text-xs font-bold">
            {state.currentProgress.voted} / {state.currentProgress.total} voted
          </span>
        )}
      </div>

      {done ? (
        <EmptyState
          emoji={state.status === "planned" ? "🎉" : "✅"}
          title={
            state.status === "planned"
              ? "You’ve got a plan"
              : state.status === "date_matching"
                ? "Time to pick a date"
                : "You’re all caught up"
          }
          message={
            state.status === "date_matching"
              ? "Everyone matched an activity. Vote on when to go."
              : state.status === "planned"
                ? "Check the plan for all the details."
                : "You’ve voted on every card. Waiting on the others — or add more with wider filters."
          }
          action={
            state.status === "date_matching" ? (
              <Link to={`/groups/${id}/date`} className="btn-primary">
                Vote on dates →
              </Link>
            ) : state.status === "planned" ? (
              <Link to={`/groups/${id}/plan`} className="btn-primary">
                View the plan
              </Link>
            ) : (
              <Link to={`/groups/${id}`} className="btn-ghost">
                Back to group
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className="swipe-stack relative mx-auto aspect-[3/4.1] w-full max-w-sm flex-1">
            {next && (
              <SwipeCard
                key={next.activity.id}
                activity={next.activity}
                interactive={false}
                z={1}
                offset={16}
              />
            )}
            {top && (
              <SwipeCard
                key={top.activity.id}
                activity={top.activity}
                onSwipe={vote}
                z={2}
              />
            )}
          </div>

          <div className="mt-5 flex items-center justify-center gap-4">
            <CircleBtn label="Nope" onClick={() => vote("nope")} disabled={busy}>
              ❌
            </CircleBtn>
            <CircleBtn
              label="Undo"
              small
              onClick={undo}
              disabled={busy || !state.lastVoted}
            >
              ↩️
            </CircleBtn>
            <CircleBtn
              label="Super like"
              small
              onClick={() => vote("superlike")}
              disabled={busy}
            >
              ⭐
            </CircleBtn>
            <CircleBtn
              label="Like"
              primary
              onClick={() => vote("like")}
              disabled={busy}
            >
              ❤️
            </CircleBtn>
          </div>
          <p className="mt-3 text-center text-xs text-ink-muted">
            {state.queue.length} card{state.queue.length === 1 ? "" : "s"} left ·
            swipe or tap
          </p>
        </>
      )}

      {celebrate && (
        <MatchCelebration
          match={celebrate}
          onContinue={() => {
            const m = celebrate;
            setCelebrate(null);
            if (m.status === "complete") nav(`/groups/${id}/plan`);
            else if (m.needsDateMatch) nav(`/groups/${id}/date`);
            else void load();
          }}
        />
      )}
    </div>
  );
}

function CircleBtn({
  children,
  label,
  onClick,
  disabled,
  primary,
  small,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  small?: boolean;
}) {
  const size = small ? "h-12 w-12 text-lg" : "h-16 w-16 text-2xl";
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid ${size} place-items-center rounded-full shadow-card transition active:scale-90 disabled:opacity-40 ${
        primary ? "bg-mingo-gradient text-white shadow-pop" : "bg-white"
      }`}
    >
      {children}
    </button>
  );
}
