import { useEffect, useReducer } from "react";
import { Confetti } from "./Confetti";
import { AvatarStack, Button } from "./ui";
import { formatWhen } from "../lib/format";
import type { MatchDTO } from "@shared/types";

/**
 * The defining VIBIN moment (§9): everyone in the group liked the same thing.
 * Deliberately NOT a dating-app "match" — the whole message is
 * "everyone wants to do this".
 *
 * Sequence (each step ~180–260ms apart, skipped under reduced-motion):
 *   1. dark → blue background settles
 *   2. a lime sweep crosses the screen
 *   3. the activity image scales into focus
 *   4. "EVERYONE'S IN" headline drops in
 *   5. member avatars pop in one by one
 *   6. details + CTA slide up
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
  const [stage, next] = useReducer((s: Stage) => (Math.min(s + 1, 5) as Stage), reduce ? 5 : 0);
  const complete = match.status === "complete";

  useEffect(() => {
    if (reduce) return;
    const timers = [180, 420, 700, 980, 1220].map((t, i) =>
      window.setTimeout(next, t + i * 40),
    );
    return () => timers.forEach(clearTimeout);
  }, [reduce]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 transition-colors duration-500"
      style={{
        background: stage >= 1
          ? "linear-gradient(160deg, #101426 0%, #1c2a6b 55%, #3155ff 100%)"
          : "#101426",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={complete ? "It's a plan" : "It's a match"}
    >
      <Confetti fire={stage >= 3} />

      {/* lime sweep */}
      {stage >= 1 && !reduce && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 animate-lime-sweep bg-lime-400/40 blur-2xl" />
      )}

      <div className="relative w-full max-w-sm text-center text-white">
        <p
          className={`text-sm font-extrabold uppercase tracking-[0.2em] text-lime-400 ${stage >= 3 ? "animate-float-up" : "opacity-0"}`}
        >
          {complete ? "It's a plan" : "It's a match"}
        </p>
        <h2
          className={`mt-2 text-4xl font-extrabold leading-tight ${stage >= 3 ? "animate-slide-up" : "opacity-0"}`}
        >
          Everyone's in.
        </h2>
        <p
          className={`mt-1 text-white/70 ${stage >= 3 ? "animate-float-up" : "opacity-0"}`}
        >
          The whole group wants to do this.
        </p>

        <div
          className="mx-auto my-6"
          style={{ perspective: "1000px" }}
        >
        <div
          className={`overflow-hidden rounded-3xl shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)] ring-1 ring-white/15 transition-transform duration-700 ${stage >= 2 ? "animate-pop-in" : "opacity-0 scale-90"}`}
          style={{ transform: stage >= 3 ? "rotateX(0deg)" : "rotateX(8deg)" }}
        >
          {match.activity.imageUrl ? (
            <img
              src={match.activity.imageUrl}
              alt={match.activity.title}
              className="h-40 w-full object-cover"
            />
          ) : (
            <div className="grid h-40 w-full place-items-center bg-vibin-blue text-6xl">
              {match.activity.categoryIcon}
            </div>
          )}
          <div className="bg-white/5 px-4 py-3 backdrop-blur">
            <p className="text-lg font-extrabold">{match.activity.title}</p>
            <p className="text-sm text-white/70">
              📍 {match.activity.locationLabel}
            </p>
          </div>
        </div>
        </div>

        <div
          className={`flex flex-col items-center gap-2 ${stage >= 4 ? "opacity-100" : "opacity-0"} transition-opacity`}
        >
          <div className="flex -space-x-2">
            {match.members.map((m, i) => (
              <div
                key={m.id}
                className={stage >= 4 && !reduce ? "animate-avatar-in" : ""}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <MemberBubble name={m.displayName} url={m.avatarUrl} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-2 text-sm text-white/80">
            <span className="rounded-full bg-white/10 px-3 py-1">
              💶 {match.activity.priceLabel}
            </span>
            {complete && match.startsAt && (
              <span className="rounded-full bg-lime-400/20 px-3 py-1 font-semibold text-lime-300">
                📅 {formatWhen(match.startsAt)}
              </span>
            )}
          </div>
        </div>

        <div className={stage >= 5 ? "animate-slide-up" : "opacity-0"}>
          <Button
            variant="lime"
            className="mt-7 w-full"
            onClick={onContinue}
            autoFocus
          >
            {complete
              ? "See the plan"
              : match.needsDateMatch
                ? "Now find a time →"
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
        className="grid h-11 w-11 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white ring-2 ring-white"
        aria-label={`${name} is in`}
      >
        {url ? (
          <img src={url} alt={name} className="h-full w-full rounded-full object-cover" />
        ) : (
          ini
        )}
      </span>
      <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-lime-400 text-[11px] font-black text-navy ring-2 ring-navy">
        ✓
      </span>
    </div>
  );
}
