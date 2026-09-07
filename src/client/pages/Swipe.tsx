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
        <Link to={`/groups/${id}`} className="text-sm text-navy-400">
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
            <CircleBtn label="Pass" tone="pass" onClick={() => vote("nope")} disabled={busy}>
              <IconX />
            </CircleBtn>
            <CircleBtn
              label="Undo last swipe"
              small
              tone="plain"
              onClick={undo}
              disabled={busy || !state.lastVoted}
            >
              <IconUndo />
            </CircleBtn>
            <CircleBtn
              label="Love it"
              small
              tone="lime"
              onClick={() => vote("superlike")}
              disabled={busy}
            >
              <IconStar />
            </CircleBtn>
            <CircleBtn
              label="Yes"
              tone="like"
              onClick={() => vote("like")}
              disabled={busy}
            >
              <IconHeart />
            </CircleBtn>
          </div>
          <p className="mt-3 text-center text-xs text-navy-400">
            {state.queue.length} card{state.queue.length === 1 ? "" : "s"} left ·
            drag the card or tap a button
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

type Tone = "pass" | "like" | "lime" | "plain";
function CircleBtn({
  children,
  label,
  onClick,
  disabled,
  tone = "plain",
  small,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: Tone;
  small?: boolean;
}) {
  const size = small ? "h-12 w-12" : "h-16 w-16";
  const toneCls: Record<Tone, string> = {
    pass: "bg-white text-navy hover:text-danger-500",
    like: "bg-brand-500 text-white shadow-pop hover:bg-brand-600",
    lime: "bg-lime-400 text-navy shadow-lime hover:bg-lime-300",
    plain: "bg-white text-navy-400 hover:text-navy",
  };
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid ${size} place-items-center rounded-full shadow-card transition
        active:scale-90 disabled:opacity-40 disabled:pointer-events-none
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper
        ${toneCls[tone]}`}
    >
      {children}
    </button>
  );
}

const S = ({ d, w = 22 }: { d: string; w?: number }) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d={d} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconX = () => <S d="M6 6l12 12M18 6L6 18" />;
const IconUndo = () => <S d="M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 0 10h-3" w={18} />;
const IconStar = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.9 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9L12 2.5Z" />
  </svg>
);
const IconHeart = () => (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 21s-7.5-4.7-9.7-9C.9 8.6 2.5 5 6 5c2.1 0 3.6 1.2 4.5 2.6l1.5 2.2 1.5-2.2C15.4 6.2 16.9 5 19 5c3.5 0 5.1 3.6 3.7 7-2.2 4.3-9.7 9-9.7 9Z" />
  </svg>
);
