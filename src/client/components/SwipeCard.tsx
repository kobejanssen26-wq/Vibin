import { useRef, useState } from "react";
import type { ActivityDTO } from "@shared/types";
import { CATEGORY_ICON } from "@shared/constants";

export type SwipeDir = "like" | "nope" | "superlike";

const CATEGORY_BG: Record<string, string> = {
  sport: "from-coral-400 to-tangerine-500",
  adventure: "from-tangerine-400 to-coral-500",
  food_drinks: "from-coral-400 to-grape-500",
  nightlife: "from-grape-500 to-ink",
  creative: "from-grape-400 to-coral-400",
  relaxation: "from-tangerine-400 to-grape-400",
  culture: "from-grape-500 to-coral-500",
  nature: "from-emerald-400 to-tangerine-400",
  gaming: "from-grape-600 to-coral-500",
  entertainment: "from-coral-500 to-grape-600",
  learning: "from-tangerine-500 to-grape-500",
  other: "from-coral-400 to-grape-500",
};

export function SwipeCard({
  activity,
  onSwipe,
  interactive = true,
  z = 1,
  offset = 0,
}: {
  activity: ActivityDTO;
  onSwipe?: (dir: SwipeDir) => void;
  interactive?: boolean;
  z?: number;
  offset?: number;
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const start = useRef<{ x: number; y: number } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
    setDrag((d) => ({ ...d, active: true }));
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDrag({
      x: e.clientX - start.current.x,
      y: e.clientY - start.current.y,
      active: true,
    });
  };
  const onUp = () => {
    if (!start.current) return;
    const { x, y } = drag;
    start.current = null;
    if (x > 120) onSwipe?.("like");
    else if (x < -120) onSwipe?.("nope");
    else if (y < -140) onSwipe?.("superlike");
    setDrag({ x: 0, y: 0, active: false });
  };

  const rot = drag.x / 18;
  const likeOp = Math.max(0, Math.min(1, drag.x / 120));
  const nopeOp = Math.max(0, Math.min(1, -drag.x / 120));
  const superOp = Math.max(0, Math.min(1, -drag.y / 140));

  return (
    <div
      className="absolute inset-0 select-none"
      style={{
        zIndex: z,
        transform: `translate(${drag.x}px, ${drag.y + offset}px) rotate(${rot}deg) scale(${1 - offset / 900})`,
        transition: drag.active ? "none" : "transform 0.35s cubic-bezier(.22,1,.36,1)",
        touchAction: "none",
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <article className="card relative h-full overflow-hidden">
        <div className="relative h-[58%] w-full overflow-hidden">
          {activity.imageUrl ? (
            <img
              src={activity.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div
              className={`h-full w-full bg-gradient-to-br ${
                CATEGORY_BG[activity.category] ?? CATEGORY_BG.other
              } grid place-items-center text-7xl`}
            >
              {CATEGORY_ICON[activity.category] ?? "✨"}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent" />
          <span className="chip absolute left-3 top-3 border-white/30 bg-white/85 backdrop-blur">
            {activity.categoryIcon} {activity.categoryLabel}
          </span>

          <Stamp text="LIKE" color="text-emerald-400 border-emerald-400" op={likeOp} rotate={-14} pos="left-4 top-6" />
          <Stamp text="NOPE" color="text-coral-500 border-coral-500" op={nopeOp} rotate={14} pos="right-4 top-6" />
          <Stamp text="SUPER" color="text-grape-400 border-grape-400" op={superOp} rotate={-8} pos="left-1/2 -translate-x-1/2 bottom-6" />

          <div className="absolute bottom-3 left-3 right-3 text-white">
            <h2 className="text-2xl font-extrabold leading-tight drop-shadow">
              {activity.title}
            </h2>
            <p className="text-sm opacity-90">📍 {activity.locationLabel}</p>
          </div>
        </div>

        <div className="flex h-[42%] flex-col gap-2 p-4">
          <div className="flex flex-wrap gap-2 text-sm font-medium text-ink-soft">
            <span className="chip">💰 {activity.priceLabel}</span>
            {activity.durationMin && (
              <span className="chip">⏱️ {Math.round(activity.durationMin / 15) * 15} min</span>
            )}
            {activity.minAge && <span className="chip">🔞 {activity.minAge}+</span>}
          </div>
          <p className="line-clamp-4 text-sm leading-relaxed text-ink-muted">
            {activity.description}
          </p>
        </div>
      </article>
    </div>
  );
}

function Stamp({
  text,
  color,
  op,
  rotate,
  pos,
}: {
  text: string;
  color: string;
  op: number;
  rotate: number;
  pos: string;
}) {
  return (
    <span
      className={`pointer-events-none absolute ${pos} rounded-lg border-4 px-3 py-1 text-2xl font-extrabold uppercase tracking-wider ${color}`}
      style={{ opacity: op, transform: `rotate(${rotate}deg)` }}
    >
      {text}
    </span>
  );
}
