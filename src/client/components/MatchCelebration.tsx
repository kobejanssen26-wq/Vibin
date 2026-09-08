import { useEffect, useReducer } from "react";
import { Confetti } from "./Confetti";
import { Button } from "./ui";
import { CategoryIcon, IconCalendar, IconMapPin, IconTag } from "./icons";
import { formatWhen } from "../lib/format";
import type { MatchDTO } from "@shared/types";

/**
 * The defining VIBIN moment: everyone in the group liked the same thing.
 * Not a dating-app "match" — the message is "everyone wants to do this".
 *
 * Staged reveal (skipped under reduced-motion):
 *   1  the surface settles from navy toward blue
 *   2  the activity slides in
 *   3  headline + copy
 *   4  the crew, each with a tick
 *   5  details + the next step
 */
type Stage = 0 | 1 | 2 | 3 | 4 | 5;

export function MatchCelebration({
  match,
  onContinue,
}: {
  match: MatchDTO;
  onContinue: () => void;
}) {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [stage, next] = useReducer(
    (s: Stage) => (Math.min(s + 1, 5) as Stage),
    reduce ? 5 : 0,
  );
  const complete = match.status === "complete";

  useEffect(() => {
    if (reduce) return;
    const timers = [140, 320, 520, 740].map((t) => window.setTimeout(next, t));
    return () => timers.forEach(clearTimeout);
  }, [reduce]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 transition-colors duration-500"
      style={{ background: stage >= 1 ? "#182353" : "#101426" }}
      role="dialog"
      aria-modal="true"
      aria-label={complete ? "It's a plan" : "It's a match"}
    >
      <Confetti fire={stage >= 3} />

      <div className="relative w-full max-w-[22rem] text-center text-white">
        <div
          className={`overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] ${
            stage >= 2 ? "animate-slide-up" : "opacity-0"
          }`}
        >
          {match.activity.imageUrl ? (
            <img
              src={match.activity.imageUrl}
              alt=""
              className="h-40 w-full object-cover"
            />
          ) : (
            <div className="grid h-40 w-full place-items-center bg-navy text-white/25">
              <CategoryIcon id={match.activity.category} size={48} />
            </div>
          )}
          <div className="px-4 py-3 text-left">
            <p className="font-bold">{match.activity.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-white/60">
              <IconMapPin size={13} />
              {match.activity.locationLabel}
            </p>
          </div>
        </div>

        <p
          className={`mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-lime-400 ${
            stage >= 3 ? "animate-float-up" : "opacity-0"
          }`}
        >
          {complete ? "It's a plan" : "It's a match"}
        </p>
        <h2
          className={`mt-1.5 text-[28px] font-extrabold leading-tight tracking-[-0.02em] ${
            stage >= 3 ? "animate-slide-up" : "opacity-0"
          }`}
        >
          Everyone's in.
        </h2>
        <p
          className={`mt-1 text-sm text-white/60 ${
            stage >= 3 ? "animate-float-up" : "opacity-0"
          }`}
        >
          The whole group wants to do this.
        </p>

        <div
          className={`mt-5 flex flex-col items-center gap-3 transition-opacity ${
            stage >= 4 ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex -space-x-2">
            {match.members.map((m, i) => (
              <div
                key={m.id}
                className={stage >= 4 && !reduce ? "animate-avatar-in" : ""}
                style={{ animationDelay: `${i * 55}ms` }}
              >
                <MemberBubble name={m.displayName} url={m.avatarUrl} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-2 text-[13px] text-white/70">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.08] px-2.5 py-1">
              <IconTag size={13} /> {match.activity.priceLabel}
            </span>
            {complete && match.startsAt && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-lime-400/15 px-2.5 py-1 font-semibold text-lime-300">
                <IconCalendar size={13} /> {formatWhen(match.startsAt)}
              </span>
            )}
          </div>
        </div>

        <div className={stage >= 5 ? "animate-slide-up" : "opacity-0"}>
          <Button
            variant="lime"
            className="mt-6 w-full"
            onClick={onContinue}
            autoFocus
          >
            {complete
              ? "See the plan"
              : match.needsDateMatch
                ? "Find a time"
                : "Keep swiping"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MemberBubble({ name, url }: { name: string; url: string | null }) {
  const ini = name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="relative">
      <span
        className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-brand-500 text-xs font-bold text-white ring-2 ring-[#182353]"
        aria-label={`${name} is in`}
      >
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          ini
        )}
      </span>
      <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-lime-400 text-[10px] font-black text-navy ring-2 ring-[#182353]">
        ✓
      </span>
    </div>
  );
}
