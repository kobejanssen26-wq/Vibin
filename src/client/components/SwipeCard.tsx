import { useCallback, useRef, useState } from "react";
import type { ActivityDTO } from "@shared/types";
import { CategoryIcon, IconMapPin } from "./icons";
import { formatDuration } from "../lib/format";

export type SwipeDir = "like" | "nope" | "superlike";

const THRESHOLD = 104;
const VELOCITY = 0.5; // px per ms

/**
 * A single activity card. Drag behaviour is deliberately plain: the card
 * follows the pointer with a small rotation, springs back if you let go
 * early, and flings off if you pass the threshold. No perspective tilt, no
 * gloss — it should feel like moving a real card, not a 3D panel.
 */
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
  const [imgOk, setImgOk] = useState(true);
  const [exit, setExit] = useState<{ x: number; y: number; r: number } | null>(
    null,
  );
  const showImage = Boolean(activity.imageUrl) && imgOk;
  const start = useRef<{ x: number; y: number } | null>(null);
  const last = useRef<{ x: number; t: number } | null>(null);
  const vx = useRef(0);

  const fling = useCallback(
    (dir: SwipeDir) => {
      const dx = dir === "nope" ? -640 : dir === "like" ? 640 : 0;
      const dy = dir === "superlike" ? -760 : -32;
      setExit({ x: dx, y: dy, r: dx / 14 });
      setDrag({ x: 0, y: 0, active: false });
      window.setTimeout(() => onSwipe?.(dir), 200);
    },
    [onSwipe],
  );

  const onDown = (e: React.PointerEvent) => {
    if (!interactive || exit) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
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
    start.current = null;
    const fast = Math.abs(vx.current) > VELOCITY;
    if (x > THRESHOLD || (fast && vx.current > 0)) fling("like");
    else if (x < -THRESHOLD || (fast && vx.current < 0)) fling("nope");
    else if (y < -THRESHOLD * 1.35) fling("superlike");
    else setDrag({ x: 0, y: 0, active: false });
  };

  const pos = exit ?? drag;
  const rot = exit ? exit.r : drag.x / 22;
  const likeOp = Math.max(0, Math.min(1, pos.x / THRESHOLD));
  const nopeOp = Math.max(0, Math.min(1, -pos.x / THRESHOLD));
  const superOp = Math.max(0, Math.min(1, -pos.y / (THRESHOLD * 1.35)));

  const transition = exit
    ? "transform 0.22s cubic-bezier(0.4, 0, 1, 1), opacity 0.22s ease"
    : drag.active
      ? "none"
      : "transform 0.36s cubic-bezier(0.22, 1, 0.36, 1)";

  const scale = interactive ? 1 : 1 - offset / 900;

  return (
    <div
      className="gpu absolute inset-0 select-none"
      style={{
        zIndex: z,
        transform: `translate3d(${pos.x}px, ${pos.y + offset}px, 0) rotate(${rot}deg) scale(${scale})`,
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
      <article className="card-raised relative flex h-full flex-col overflow-hidden">
        {/* like / pass feedback — a clean edge, no glow */}
        <div
          className="pointer-events-none absolute inset-0 z-20 rounded-2xl border-2 border-brand-500"
          style={{ opacity: likeOp }}
        />
        <div
          className="pointer-events-none absolute inset-0 z-20 rounded-2xl border-2 border-navy"
          style={{ opacity: nopeOp }}
        />
        <div
          className="pointer-events-none absolute inset-0 z-20 rounded-2xl border-2 border-lime-500"
          style={{ opacity: superOp }}
        />

        {/* image */}
        <div className="relative h-[58%] w-full shrink-0 overflow-hidden bg-navy">
          {showImage ? (
            <img
              src={activity.imageUrl!}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
              loading="lazy"
              onError={() => setImgOk(false)}
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-navy text-white/25">
              <CategoryIcon id={activity.category} size={56} />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-navy/85 to-transparent" />

          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-2 py-1 text-[12px] font-semibold text-navy">
            <CategoryIcon id={activity.category} size={14} />
            {activity.categoryLabel}
          </span>

          <Stamp text="YES" tone="text-brand-500 border-brand-500" op={likeOp} rot={-10} pos="left-4 top-5" />
          <Stamp text="PASS" tone="text-navy border-navy" op={nopeOp} rot={10} pos="right-4 top-5" />
          <Stamp text="LOVE IT" tone="text-lime-600 border-lime-600" op={superOp} rot={-5} pos="left-1/2 -translate-x-1/2 bottom-5" />

          <div className="absolute inset-x-4 bottom-3 text-white">
            <h2 className="text-[21px] font-bold leading-tight tracking-[-0.01em]">
              {activity.title}
            </h2>
            <p className="mt-0.5 flex items-center gap-1 text-[13px] text-white/80">
              <IconMapPin size={13} className="shrink-0" />
              <span className="truncate">
                {activity.provider || activity.locationLabel}
                {activity.distanceKm != null && ` · ${activity.distanceKm} km`}
              </span>
            </p>
          </div>
        </div>

        {/* meta */}
        <div className="flex flex-1 flex-col gap-2.5 p-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold text-navy">
            <span className="text-brand-600">{activity.priceLabel}</span>
            {activity.durationMin ? (
              <>
                <Dot />
                <span className="text-navy-500">
                  {formatDuration(activity.durationMin)}
                </span>
              </>
            ) : null}
            {activity.indoorOutdoor ? (
              <>
                <Dot />
                <span className="text-navy-500">
                  {activity.indoorOutdoor === "indoor"
                    ? "Indoor"
                    : activity.indoorOutdoor === "outdoor"
                      ? "Outdoor"
                      : "Indoor / outdoor"}
                </span>
              </>
            ) : null}
            {activity.minAge ? (
              <>
                <Dot />
                <span className="text-navy-500">{activity.minAge}+</span>
              </>
            ) : null}
          </div>
          <p className="line-clamp-4 text-[13px] leading-relaxed text-navy-500">
            {activity.description}
          </p>
        </div>
      </article>
    </div>
  );
}

function Dot() {
  return <span className="h-1 w-1 rounded-full bg-navy-300" aria-hidden="true" />;
}

function Stamp({
  text,
  tone,
  op,
  rot,
  pos,
}: {
  text: string;
  tone: string;
  op: number;
  rot: number;
  pos: string;
}) {
  return (
    <span
      className={`pointer-events-none absolute ${pos} z-30 rounded-md border-2 bg-white/90 px-2.5 py-0.5 text-lg font-extrabold uppercase tracking-wide ${tone}`}
      style={{ opacity: op, transform: `rotate(${rot}deg)` }}
    >
      {text}
    </span>
  );
}
