import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, ApiRequestError } from "../lib/api";
import { SwipeCard, type SwipeDir } from "../components/SwipeCard";
import { ActivityExpanded } from "../components/ActivityExpanded";
import { MatchCelebration } from "../components/MatchCelebration";
import { EmptyState, ErrorState } from "../components/ui";
import { SwipeSkeleton } from "../components/SwipeSkeleton";
import { track } from "../lib/track";
import {
  IconArrowLeft,
  IconClose,
  IconHeart,
  IconStar,
  IconUndo,
} from "../components/icons";
import { BUDGET_BANDS } from "@shared/constants";
import type {
  MatchDTO,
  SwipeCardDTO,
  SwipeStateDTO,
} from "@shared/types";

/** Pull the next batch once the local queue runs this low. */
const PREFETCH_AT = 8;

type Meta = Omit<SwipeStateDTO, "queue">;

export function Swipe() {
  const { id = "" } = useParams();
  const nav = useNavigate();

  const [meta, setMeta] = useState<Meta | null>(null);
  const [queue, setQueue] = useState<SwipeCardDTO[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [celebrate, setCelebrate] = useState<MatchDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<SwipeCardDTO | null>(null);

  const seenMatchIds = useRef<Set<string>>(new Set());
  /** activityIds this client has voted on — never let a merge re-add them. */
  const votedLocally = useRef<Set<string>>(new Set());
  const extending = useRef(false);
  const initialised = useRef(false);

  /** Merge a server snapshot into local state without disturbing the queue head. */
  const applyServer = useCallback((s: SwipeStateDTO, replace: boolean) => {
    const { queue: serverQueue, ...rest } = s;
    setMeta(rest);

    if (
      s.newMatch &&
      !seenMatchIds.current.has(s.newMatch.id) &&
      (s.status === "date_matching" || s.status === "planned")
    ) {
      seenMatchIds.current.add(s.newMatch.id);
      setCelebrate(s.newMatch);
    }

    setQueue((prev) => {
      if (replace || !initialised.current) {
        initialised.current = true;
        return serverQueue.filter((c) => !votedLocally.current.has(c.activity.id));
      }
      // Poll / prefetch merge: keep the local queue and its order untouched,
      // only append cards the server has that we don't (a new batch, or another
      // member extended the pool). A locally-swiped card never comes back.
      const localIds = new Set(prev.map((c) => c.activity.id));
      const added = serverQueue.filter(
        (c) =>
          !localIds.has(c.activity.id) &&
          !votedLocally.current.has(c.activity.id),
      );
      return added.length ? [...prev, ...added] : prev;
    });
  }, []);

  const load = useCallback(
    async (replace = false) => {
      try {
        const s = await api<SwipeStateDTO>(`/groups/${id}/swipe`);
        applyServer(s, replace);
        setErr(null);
      } catch (e) {
        setErr(e instanceof ApiRequestError ? e.message : "Could not load swipe.");
      } finally {
        setLoading(false);
      }
    },
    [id, applyServer],
  );

  const extend = useCallback(async () => {
    if (extending.current || !meta?.hasMore) return;
    extending.current = true;
    try {
      const s = await api<SwipeStateDTO>(`/groups/${id}/swipe/extend`, {
        method: "POST",
        body: {},
      });
      applyServer(s, false);
    } catch {
      /* a failed prefetch is silent — the next swipe retries */
    } finally {
      extending.current = false;
    }
  }, [id, meta?.hasMore, applyServer]);

  useEffect(() => {
    void load(true);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load(false);
    }, 5000);
    const onVis = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  // keep the buffer full
  useEffect(() => {
    if (queue.length <= PREFETCH_AT && meta?.hasMore) void extend();
  }, [queue.length, meta?.hasMore, extend]);

  // one impression per (group, activity) when a card reaches the top
  const topActivityId = queue[0]?.activity.id;
  useEffect(() => {
    if (!topActivityId) return;
    track({
      name: "activity_viewed",
      groupId: id,
      activityId: topActivityId,
      dedupeKey: `${id}:${topActivityId}:view`,
    });
  }, [id, topActivityId]);

  const vote = async (dir: SwipeDir) => {
    if (busy || queue.length === 0) return;
    const card = queue[0]!;
    setBusy(true);
    votedLocally.current.add(card.activity.id);
    setQueue((q) => q.slice(1)); // optimistic pop
    try {
      const res = await api<{ newMatch: MatchDTO | null }>(
        `/groups/${id}/swipe`,
        { method: "POST", body: { activityId: card.activity.id, value: dir } },
      );
      if (res.newMatch && !seenMatchIds.current.has(res.newMatch.id)) {
        seenMatchIds.current.add(res.newMatch.id);
        setCelebrate(res.newMatch);
      }
      // meta (member-vote pips, hasMore, deckSize) refreshes on the 5 s poll —
      // no GET per swipe, so a fast swiper doesn't hammer the API.
      setMeta((m) =>
        m ? { ...m, swipedByYou: m.swipedByYou + 1, lastVoted: card } : m,
      );
    } catch (e) {
      votedLocally.current.delete(card.activity.id);
      setErr(e instanceof ApiRequestError ? e.message : "Vote failed.");
      await load(true);
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    setBusy(true);
    try {
      const res = await api<{ undoneActivityId: string }>(
        `/groups/${id}/swipe/undo`,
        { method: "POST", body: {} },
      );
      votedLocally.current.delete(res.undoneActivityId);
      await load(true); // undo re-orders the deck — take the server's queue wholesale
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : "Nothing to undo.");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !meta) return <SwipeSkeleton />;
  if (err && !meta) return <ErrorState message={err} onRetry={() => load(true)} />;
  if (!meta) return null;

  if (meta.status === "configuring") {
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

  const top = queue[0];
  const next = queue[1];
  // "empty right now" — but the backend may still have more coming
  const waitingForMore = queue.length === 0 && meta.hasMore;
  const trulyDone = queue.length === 0 && !meta.hasMore;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          to={`/groups/${id}`}
          className="-ml-2 inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-navy-500 hover:bg-navy/5"
        >
          <IconArrowLeft size={18} /> Group
        </Link>
        {meta.currentProgress && meta.currentProgress.total > 1 && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-paper-soft px-3 py-1.5 text-xs font-bold text-navy"
            aria-label={`${meta.currentProgress.voted} of ${meta.currentProgress.total} members voted on this card`}
          >
            <span className="flex gap-1">
              {Array.from({ length: meta.currentProgress.total }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${
                    i < meta.currentProgress!.voted ? "bg-brand-500" : "bg-navy/15"
                  }`}
                />
              ))}
            </span>
            {meta.currentProgress.voted}/{meta.currentProgress.total} in
          </span>
        )}
      </div>

      {meta.filters && (
        <FilterBar
          groupId={id}
          filters={meta.filters}
          canChange={meta.canChangeFilters}
        />
      )}

      {trulyDone ? (
        <EmptyState
          emoji={
            meta.status === "planned"
              ? "🎉"
              : meta.status === "date_matching"
                ? "📅"
                : "✓"
          }
          title={
            meta.status === "planned"
              ? "You've got a plan"
              : meta.status === "date_matching"
                ? "Time to pick a date"
                : "That's everything for now"
          }
          message={
            meta.status === "date_matching"
              ? "Everyone matched an activity. Now vote on when to go."
              : meta.status === "planned"
                ? "The plan has everything: place, time, price and the booking link."
                : meta.canChangeFilters
                  ? "You've seen every activity that fits. Widen the radius or change the category for more."
                  : "You've seen every activity that fits these filters."
          }
          action={
            meta.status === "date_matching" ? (
              <Link to={`/groups/${id}/date`} className="btn-primary">
                Vote on dates
              </Link>
            ) : meta.status === "planned" ? (
              <Link to={`/groups/${id}/plan`} className="btn-primary">
                View the plan
              </Link>
            ) : meta.canChangeFilters ? (
              <Link to={`/groups/${id}/config`} className="btn-primary">
                Change filters
              </Link>
            ) : (
              <Link to={`/groups/${id}`} className="btn-outline">
                Back to group
              </Link>
            )
          }
        />
      ) : waitingForMore ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-navy-400">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-navy/15 border-t-brand-500" />
          <p className="text-sm font-medium">Loading more…</p>
        </div>
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
                onExpand={() => setExpanded(top)}
                z={2}
              />
            )}
          </div>

          <div className="mt-5 flex items-center justify-center gap-4">
            <CircleBtn label="Pass" tone="pass" onClick={() => vote("nope")} disabled={busy}>
              <IconClose size={26} />
            </CircleBtn>
            <CircleBtn
              label="Undo last swipe"
              small
              tone="plain"
              onClick={undo}
              disabled={busy || !meta.lastVoted}
            >
              <IconUndo size={18} />
            </CircleBtn>
            <CircleBtn
              label="Love it"
              small
              tone="lime"
              onClick={() => vote("superlike")}
              disabled={busy}
            >
              <IconStar size={18} />
            </CircleBtn>
            <CircleBtn label="Yes" tone="like" onClick={() => vote("like")} disabled={busy}>
              <IconHeart size={24} />
            </CircleBtn>
          </div>
          <p className="mt-3 text-center text-xs text-navy-400">
            {meta.swipedByYou > 0 && `${meta.swipedByYou} swiped · `}
            {queue.length}
            {meta.hasMore ? "+" : ""} to go · drag the card or tap a button
          </p>
        </>
      )}

      {expanded && (
        <ActivityExpanded
          activity={expanded.activity}
          groupId={id}
          onClose={() => setExpanded(null)}
        />
      )}

      {celebrate && (
        <MatchCelebration
          match={celebrate}
          onContinue={() => {
            const m = celebrate;
            setCelebrate(null);
            if (m.status === "complete") nav(`/groups/${id}/plan`);
            else if (m.needsDateMatch) nav(`/groups/${id}/date`);
            else void load(false);
          }}
        />
      )}
    </div>
  );
}

/* --------------------------- active-filter bar --------------------------- */
function FilterBar({
  groupId,
  filters,
  canChange,
}: {
  groupId: string;
  filters: NonNullable<SwipeStateDTO["filters"]>;
  canChange: boolean;
}) {
  const chips: string[] = [];
  chips.push(
    filters.allActivities
      ? "All activities"
      : filters.categories.length === 1
        ? cap(filters.categories[0]!)
        : `${filters.categories.length} categories`,
  );
  if (filters.locationLabel)
    chips.push(`${filters.locationLabel} · ${filters.radiusKm} km`);
  if (filters.budgetBand !== "any")
    chips.push(BUDGET_BANDS.find((b) => b.id === filters.budgetBand)?.label ?? "");
  if (filters.dateKnown) chips.push("Date set");

  const inner = (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.filter(Boolean).map((c) => (
        <span
          key={c}
          className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-navy shadow-card"
        >
          {c}
        </span>
      ))}
      {canChange && (
        <span className="rounded-full bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white">
          Change ›
        </span>
      )}
    </div>
  );

  return (
    <div className="mb-3">
      {canChange ? (
        <Link to={`/groups/${groupId}/config`} aria-label="Change filters">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </div>
  );
}

function cap(s: string): string {
  return s.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());
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
  children: ReactNode;
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
