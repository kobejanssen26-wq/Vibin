import { DescriptionCredit } from "./DescriptionCredit";
import { useCallback, useRef, useState } from "react";
import type { ActivityDTO } from "@shared/types";
import { CATEGORY_ICON } from "@shared/constants";
import { IconMapPin, IconInfo } from "./icons";
import { formatDuration, localizePrice } from "../lib/format";
import { useLang } from "../lib/i18n";

export type SwipeDir = "like" | "nope" | "superlike";

const CATEGORY_BG: Record<string, string> = {
  sport: "from-brand-500 to-brand-700",
  adventure: "from-brand-600 to-navy-800",
  food_drinks: "from-brand-500 to-navy-700",
  nightlife: "from-navy-800 to-brand-700",
  creative: "from-brand-500 to-brand-400",
  relaxation: "from-brand-400 to-brand-600",
  culture: "from-navy-700 to-brand-600",
  nature: "from-brand-600 to-lime-500",
  gaming: "from-navy-800 to-brand-600",
  entertainment: "from-brand-500 to-navy-800",
  learning: "from-brand-600 to-brand-400",
  other: "from-brand-500 to-navy-700",
};

const THRESHOLD = 108;
const VELOCITY = 0.55; // px per ms

/** movement (px) below which a pointer-down/up is a tap, not a drag */
const TAP_MOVE_MAX = 8;
/** duration (ms) above which a stationary press stops counting as a tap */
const TAP_TIME_MAX = 400;

export function SwipeCard({
  activity,
  onSwipe,
  onExpand,
  interactive = true,
  z = 1,
  offset = 0,
}: {
  activity: ActivityDTO;
  onSwipe?: (dir: SwipeDir) => void;
  /** tap (not drag) on the card — opens the expanded detail view */
  onExpand?: () => void;
  interactive?: boolean;
  z?: number;
  offset?: number;
}) {
  const { t } = useLang();
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [imgOk, setImgOk] = useState(true);
  const [exit, setExit] = useState<{ x: number; y: number; r: number } | null>(
    null,
  );
  const showImage = Boolean(activity.imageUrl) && imgOk;
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const last = useRef<{ x: number; t: number } | null>(null);
  const vx = useRef(0);

  const fling = useCallback(
    (dir: SwipeDir) => {
      const dx = dir === "nope" ? -700 : dir === "like" ? 700 : 0;
      const dy = dir === "superlike" ? -800 : -40;
      setExit({ x: dx, y: dy, r: dx / 12 });
      setDrag({ x: 0, y: 0, active: false });
      window.setTimeout(() => onSwipe?.(dir), 220);
    },
    [onSwipe],
  );

  const onDown = (e: React.PointerEvent) => {
    if (!interactive || exit) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    last.current = { x: e.clientX, t: performance.now() };
    setDrag((d) => ({ ...d, active: true }));
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const now = performance.now();
    if (last.current) {
      const dt = now - last.current.t || 16;
      vx.current = (e.clientX - last.current.x) / dt;
    }
    last.current = { x: e.clientX, t: now };
    setDrag({
      x: e.clientX - start.current.x,
      y: e.clientY - start.current.y,
      active: true,
    });
  };
  const onUp = () => {
    if (!start.current) return;
    const { x, y } = drag;
    const heldFor = performance.now() - start.current.t;
    const moved = Math.hypot(x, y);
    start.current = null;
    const fast = Math.abs(vx.current) > VELOCITY;
    if (x > THRESHOLD || (fast && vx.current > 0)) fling("like");
    else if (x < -THRESHOLD || (fast && vx.current < 0)) fling("nope");
    else if (y < -THRESHOLD * 1.3) fling("superlike");
    else {
      setDrag({ x: 0, y: 0, active: false }); // spring back
      if (onExpand && moved <= TAP_MOVE_MAX && heldFor <= TAP_TIME_MAX) {
        onExpand();
      }
    }
  };

  const pos = exit ?? drag;
  const rot = exit ? exit.r : drag.x / 16;
  const likeOp = Math.max(0, Math.min(1, pos.x / THRESHOLD));
  const nopeOp = Math.max(0, Math.min(1, -pos.x / THRESHOLD));
  const superOp = Math.max(0, Math.min(1, -pos.y / (THRESHOLD * 1.3)));

  const transition = exit
    ? "transform 0.24s cubic-bezier(0.4, 0, 1, 1), opacity 0.24s ease"
    : drag.active
      ? "none"
      : "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)"; // exponential snap-back, no overshoot

  return (
    <div
      className="absolute inset-0 select-none"
      style={{
        zIndex: z,
        transform: `translate(${pos.x}px, ${pos.y + offset}px) rotate(${rot}deg) scale(${1 - offset / 1100})`,
        opacity: exit ? 0 : 1,
        transition,
        touchAction: "none",
        cursor: interactive ? (drag.active ? "grabbing" : "grab") : "default",
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <article className="card-raised group relative h-full overflow-hidden">
        {/* edge glow feedback */}
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-3xl ring-4 ring-inset ring-brand-500 transition-opacity"
          style={{ opacity: likeOp * 0.9 }}
        />
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-3xl ring-4 ring-inset ring-navy transition-opacity"
          style={{ opacity: nopeOp * 0.9 }}
        />
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-3xl ring-4 ring-inset ring-lime-400 transition-opacity"
          style={{ opacity: superOp * 0.9 }}
        />

        <div className="relative h-[56%] w-full overflow-hidden">
          {showImage ? (
            <img
              src={activity.imageUrl!}
              alt={activity.title}
              className="h-full w-full object-cover"
              draggable={false}
              loading="lazy"
              onError={() => setImgOk(false)}
            />
          ) : (
            <div
              className={`relative grid h-full w-full place-items-center bg-gradient-to-br ${
                CATEGORY_BG[activity.category] ?? CATEGORY_BG.other
              }`}
            >
              <div
                className="absolute inset-0 opacity-[0.14]"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)",
                  backgroundSize: "22px 22px",
                }}
              />
              <span className="grid h-20 w-20 place-items-center rounded-full bg-white/12 text-4xl ring-1 ring-white/20 backdrop-blur-sm">
                {CATEGORY_ICON[activity.category] ?? "✨"}
              </span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-navy via-navy/70 to-transparent" />
          <span className="chip absolute left-3 top-3 border-white/20 bg-white/90 backdrop-blur">
            {activity.categoryIcon} {activity.categoryLabel}
          </span>
          {onExpand && (
            <button
              type="button"
              aria-label={t("swipeCard.openInfoAria", { title: activity.title })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onExpand();
              }}
              className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full bg-navy/45 text-white backdrop-blur-sm"
            >
              <IconInfo size={16} />
            </button>
          )}
          {showImage && activity.imageAttribution && (
            <span
              className={`pointer-events-none absolute right-2 max-w-[55%] truncate rounded bg-navy/45 px-1.5 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm ${
                onExpand ? "top-[46px]" : "top-2"
              }`}
              title={activity.imageAttribution}
            >
              {activity.imageAttribution}
            </span>
          )}

          <Stamp text={t("swipeCard.stampYes")} cls="text-brand-500 border-brand-500" op={likeOp} rotate={-13} pos="left-4 top-6" />
          <Stamp text={t("swipeCard.stampPass")} cls="text-navy border-navy" op={nopeOp} rotate={13} pos="right-4 top-6" />
          <Stamp text={t("swipeCard.stampLoveIt")} cls="text-lime-500 border-lime-500" op={superOp} rotate={-7} pos="left-1/2 -translate-x-1/2 bottom-6" />

          <div className="absolute bottom-3 left-3 right-3 text-white">
            <h2 className="text-[22px] font-extrabold leading-tight drop-shadow-sm">
              {activity.title}
            </h2>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-white/90">
              <IconMapPin size={15} className="shrink-0" />
              <span className="truncate">
                {activity.locationLabel}
                {activity.distanceKm != null && ` · ${activity.distanceKm} km`}
              </span>
            </p>
          </div>
        </div>

        <div className="flex h-[44%] flex-col gap-2.5 p-4">
          <div className="flex flex-wrap gap-1.5 text-[13px] font-semibold">
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-700">
              {localizePrice(activity.priceLabel)}
            </span>
            {activity.durationMin ? (
              <span className="rounded-full bg-paper-soft px-2.5 py-1 text-navy-600">
                {formatDuration(activity.durationMin)}
              </span>
            ) : null}
            {activity.indoorOutdoor ? (
              <span className="rounded-full bg-paper-soft px-2.5 py-1 text-navy-600">
                {activity.indoorOutdoor === "indoor"
                  ? t("activity.indoor")
                  : activity.indoorOutdoor === "outdoor"
                    ? t("activity.outdoor")
                    : t("activity.indoorOutdoor")}
              </span>
            ) : null}
            {activity.minAge ? (
              <span className="rounded-full bg-paper-soft px-2.5 py-1 text-navy-600">
                {activity.minAge}+
              </span>
            ) : null}
          </div>
          {activity.description && (
            <p className="line-clamp-4 text-sm leading-relaxed text-navy-500">
              {activity.description}
            </p>
          )}
          <DescriptionCredit credit={activity.descriptionCredit} />
          {activity.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {activity.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-paper-soft px-2 py-0.5 text-[11px] font-medium text-navy-400"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            {activity.provider ? (
              <p className="min-w-0 truncate text-xs text-navy-400">
                {t("activity.at")}{" "}
                <span className="font-semibold text-navy-600">
                  {activity.provider}
                </span>
              </p>
            ) : (
              <span />
            )}
            {onExpand && (
              <span className="shrink-0 text-xs font-bold text-brand-600 transition-transform group-active:translate-x-0.5">
                {t("swipeCard.moreInfo")}
              </span>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}

function Stamp({
  text,
  cls,
  op,
  rotate,
  pos,
}: {
  text: string;
  cls: string;
  op: number;
  rotate: number;
  pos: string;
}) {
  return (
    <span
      className={`pointer-events-none absolute ${pos} z-20 rounded-xl border-[3px] bg-white/80 px-3 py-1 text-2xl font-extrabold uppercase tracking-wider backdrop-blur ${cls}`}
      style={{ opacity: op, transform: `rotate(${rotate}deg)` }}
    >
      {text}
    </span>
  );
}
