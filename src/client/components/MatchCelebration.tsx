import { Confetti } from "./Confetti";
import { AvatarStack, Button } from "./ui";
import { formatWhen } from "../lib/format";
import type { MatchDTO } from "@shared/types";

export function MatchCelebration({
  match,
  onContinue,
}: {
  match: MatchDTO;
  onContinue: () => void;
}) {
  const complete = match.status === "complete";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-5 backdrop-blur">
      <Confetti fire />
      <div className="card relative w-full max-w-sm animate-pop-in overflow-hidden p-6 text-center">
        <p className="text-sm font-extrabold uppercase tracking-widest text-coral-500">
          {complete ? "It’s a plan!" : "It’s a match!"}
        </p>
        <h2 className="mt-1 text-3xl font-extrabold">
          {complete ? "🎉" : "🔥"} {match.activity.title}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {complete
            ? "Activity and date are locked in."
            : "Everyone wants to do this."}
        </p>

        <div className="my-5 overflow-hidden rounded-2xl">
          {match.activity.imageUrl ? (
            <img
              src={match.activity.imageUrl}
              alt=""
              className="h-36 w-full object-cover"
            />
          ) : (
            <div className="grid h-36 w-full place-items-center bg-mingo-gradient text-5xl">
              {match.activity.categoryIcon}
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 text-sm text-ink-muted">
          <AvatarStack people={match.members} size={36} />
          <p>📍 {match.activity.locationLabel}</p>
          {complete && <p>📅 {formatWhen(match.startsAt)}</p>}
          <p>💰 {match.activity.priceLabel}</p>
        </div>

        <Button className="mt-6 w-full" onClick={onContinue}>
          {complete
            ? "View the plan"
            : match.needsDateMatch
              ? "Pick a date →"
              : "Keep swiping"}
        </Button>
      </div>
    </div>
  );
}
