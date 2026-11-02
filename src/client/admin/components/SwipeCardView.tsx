import { useCallback, useEffect, useRef, useState } from "react";
import { CATEGORY_ICON } from "@shared/constants";
import { Badge } from "../ui";
import type { SwipeCardData } from "./swipe-types";

export type SwipeDir = "delete" | "keep" | "later";

const THRESHOLD = 110;
const TAP_MOVE_MAX = 8;

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "slate"> = {
  verified: "green",
  needs_review: "amber",
  outdated: "red",
  inactive: "slate",
};
const STATUS_LABEL: Record<string, string> = {
  verified: "Geverifieerd",
  needs_review: "Nog te controleren",
  outdated: "Verouderd",
  inactive: "Inactief",
};
const EVIDENCE_LABEL: Record<string, string> = {
  verified: "bevestigd",
  likely: "waarschijnlijk",
  unverified: "niet bevestigd",
  invalid: "ongeldig",
  not_found: "niet gevonden",
  conflict: "tegenstrijdig",
};
const EVIDENCE_TONE: Record<string, "green" | "blue" | "amber" | "red" | "slate"> = {
  verified: "green",
  likely: "blue",
  unverified: "slate",
  invalid: "red",
  not_found: "amber",
  conflict: "red",
};
const VERDICT_LABEL: Record<string, string> = {
  approved: "goedgekeurd",
  fix_data: "gegevens corrigeren",
  manual: "handmatige controle",
  exclude: "uitsluiten",
  duplicate: "dubbel",
  closed: "gesloten",
};

function exitTransform(dir: SwipeDir, from: { x: number; y: number }) {
  if (dir === "delete") return `translate(-140%, ${from.y - 30}px) rotate(-18deg)`;
  if (dir === "keep") return `translate(140%, ${from.y - 30}px) rotate(18deg)`;
  return `translate(${from.x}px, -130%) rotate(0deg)`;
}

/**
 * One big review card. Drag it (mouse or touch): left = delete, right = keep, up = later.
 * The parent owns the decision; this component only reports the direction and animates.
 */
export function SwipeCardView({
  card,
  onDecide,
  onDetails,
  interactive = true,
  exiting,
  stackDepth = 0,
}: {
  card: SwipeCardData;
  onDecide?: (dir: SwipeDir, from: { x: number; y: number }) => void;
  onDetails?: () => void;
  interactive?: boolean;
  /** set by the parent while the card flies off */
  exiting?: { dir: SwipeDir; from: { x: number; y: number } } | null;
  /** 1 = the card peeking out from behind the front card */
  stackDepth?: number;
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [imgOk, setImgOk] = useState(true);
  const [go, setGo] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(0);

  useEffect(() => setImgOk(true), [card.id]);
  // two-step so the CSS transition really runs from the release position
  useEffect(() => {
    if (!exiting) return;
    const t = requestAnimationFrame(() => setGo(true));
    return () => cancelAnimationFrame(t);
  }, [exiting]);

  const down = (e: React.PointerEvent) => {
    if (!interactive || exiting) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = 0;
    setDrag({ x: 0, y: 0, active: true });
  };
  const move = (e: React.PointerEvent) => {
    if (!start.current) return;
    const x = e.clientX - start.current.x;
    const y = Math.min(0, e.clientY - start.current.y) * 0.6 + Math.max(0, e.clientY - start.current.y) * 0.15;
    moved.current = Math.max(moved.current, Math.hypot(x, e.clientY - start.current.y));
    setDrag({ x, y, active: true });
  };
  const up = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      start.current = null;
      if (moved.current < TAP_MOVE_MAX) {
        setDrag({ x: 0, y: 0, active: false });
        onDetails?.();
        return;
      }
      if (dx <= -THRESHOLD && Math.abs(dx) > Math.abs(dy)) onDecide?.("delete", { x: dx, y: dy * 0.6 });
      else if (dx >= THRESHOLD && Math.abs(dx) > Math.abs(dy)) onDecide?.("keep", { x: dx, y: dy * 0.6 });
      else if (dy <= -THRESHOLD && Math.abs(dy) > Math.abs(dx)) onDecide?.("later", { x: dx, y: dy });
      setDrag({ x: 0, y: 0, active: false });
    },
    [onDecide, onDetails],
  );

  const pull = (n: number) => Math.min(1, Math.abs(n) / THRESHOLD);
  const leftP = drag.x < 0 ? pull(drag.x) : 0;
  const rightP = drag.x > 0 ? pull(drag.x) : 0;
  const upP = drag.y < 0 && Math.abs(drag.y) > Math.abs(drag.x) ? pull(drag.y / 0.6) : 0;

  let transform: string;
  let transition = "none";
  if (exiting) {
    transform = go ? exitTransform(exiting.dir, exiting.from) : `translate(${exiting.from.x}px, ${exiting.from.y}px) rotate(${exiting.from.x / 18}deg)`;
    transition = go ? "transform 240ms cubic-bezier(.2,.7,.2,1), opacity 240ms" : "none";
  } else if (stackDepth > 0) {
    transform = `translateY(${10 * stackDepth}px) scale(${1 - 0.04 * stackDepth})`;
  } else {
    transform = `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 22}deg)`;
    transition = drag.active ? "none" : "transform 220ms cubic-bezier(.2,.7,.2,1)";
  }

  const icon = (CATEGORY_ICON as Record<string, string>)[card.categoryId] ?? "✨";
  const showImage = !!card.imageUrl && imgOk;
  const place = [card.address, card.city].filter(Boolean).join(", ") || card.locationLabel;
  const verified = card.status === "verified";

  return (
    <article
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        start.current = null;
        setDrag({ x: 0, y: 0, active: false });
      }}
      style={{ transform, transition, opacity: exiting && go ? 0 : 1, touchAction: "none" }}
      className={`absolute inset-0 flex select-none flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-900/10 ${
        interactive && !exiting && stackDepth === 0 ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      aria-label={card.title}
    >
      {/* image */}
      <div className="relative h-[42%] min-h-[140px] shrink-0 bg-gradient-to-br from-brand-500 to-navy-800">
        {showImage ? (
          <img
            src={card.imageUrl!}
            alt=""
            draggable={false}
            onError={() => setImgOk(false)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-7xl opacity-90">{icon}</div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-slate-950/80 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-800 backdrop-blur">
            {icon} {card.category}
            {card.subcategory ? ` · ${card.subcategory}` : ""}
          </span>
          {card.imageIsGeneric && showImage && (
            <span className="rounded-full bg-amber-100/95 px-2.5 py-1 text-[11px] font-semibold text-amber-900">stockfoto</span>
          )}
        </div>
        <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
          {card.deleted && <span className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white">VERWIJDERD</span>}
          {!card.deleted && !card.active && (
            <span className="rounded-full bg-slate-800/90 px-2.5 py-1 text-[11px] font-bold text-white">verborgen door audit</span>
          )}
          {card.decision === "keep" && <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white">BEHOUDEN</span>}
          {card.decision === "later" && <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white">LATER</span>}
        </div>
        <h2 className="absolute inset-x-4 bottom-3 text-2xl font-extrabold leading-tight tracking-tight text-white drop-shadow">
          {card.title}
        </h2>
      </div>

      {/* facts */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <p className="line-clamp-3 text-[13px] leading-relaxed text-slate-700">
          {card.description || <span className="italic text-slate-400">Geen beschrijving.</span>}
        </p>

        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
          <Fact label="Adres">{place || "—"}</Fact>
          <Fact label="Website">
            {card.websiteUrl ? (
              <a
                href={card.websiteUrl}
                target="_blank"
                rel="noreferrer noopener"
                onPointerDown={(e) => e.stopPropagation()}
                className="break-all text-brand-700 underline decoration-brand-300 hover:text-brand-800"
              >
                {card.websiteUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
              </a>
            ) : (
              "—"
            )}
          </Fact>
          <Fact label="E-mail">
            {card.contacts.length ? (
              <span className="flex flex-wrap gap-1">
                {card.contacts.slice(0, 2).map((c) => (
                  <span key={c.email} className="inline-flex items-center gap-1">
                    <span className="break-all">{c.email}</span>
                    <Badge tone={EVIDENCE_TONE[c.evidence] ?? "slate"}>{EVIDENCE_LABEL[c.evidence] ?? c.evidence}</Badge>
                  </span>
                ))}
              </span>
            ) : (
              "—"
            )}
          </Fact>
          <Fact label="Organisatie">
            {card.organisation
              ? `${card.organisation.name}${card.organisation.activityCount > 1 ? ` (${card.organisation.activityCount} activiteiten)` : ""}`
              : card.provider || "—"}
          </Fact>
        </dl>

        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          <Badge tone={STATUS_TONE[card.status] ?? "slate"}>{STATUS_LABEL[card.status] ?? card.status}</Badge>
          {!verified && <span className="text-[11px] text-slate-400">behouden ≠ geverifieerd</span>}
          {card.research ? (
            <Badge tone={card.research.verdict === "approved" ? "green" : card.research.verdict === "manual" ? "amber" : "blue"}>
              onderzoek: {VERDICT_LABEL[card.research.verdict] ?? card.research.verdict}
            </Badge>
          ) : (
            <Badge>nog niet onderzocht</Badge>
          )}
          {card.audit && card.audit.outcome !== "approved" && !card.research && (
            <Badge tone={card.audit.outcome === "manual" ? "amber" : "slate"}>audit: {VERDICT_LABEL[card.audit.outcome] ?? card.audit.outcome}</Badge>
          )}
          {card.research && card.research.pendingCorrections > 0 && (
            <Badge tone="amber">{card.research.pendingCorrections} correctievoorstel(len)</Badge>
          )}
          {card.reresearch && <Badge tone="blue">opnieuw onderzoeken gevraagd</Badge>}
        </div>
        {card.research?.note && (
          <p className="line-clamp-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-600">
            <span className="font-semibold text-slate-700">Onderzoeksnotitie: </span>
            {card.research.note}
          </p>
        )}
      </div>

      {/* drag feedback */}
      <Stamp show={leftP} tone="rose" label="VERWIJDEREN" side="right" />
      <Stamp show={rightP} tone="emerald" label={card.deleted ? "HERSTELLEN" : "BEHOUDEN"} side="left" />
      <Stamp show={upP} tone="amber" label="LATER" side="center" />
    </article>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-800">{children}</dd>
    </div>
  );
}

function Stamp({ show, tone, label, side }: { show: number; tone: "rose" | "emerald" | "amber"; label: string; side: "left" | "right" | "center" }) {
  if (show <= 0.04) return null;
  const color = tone === "rose" ? "border-rose-500 text-rose-500" : tone === "emerald" ? "border-emerald-500 text-emerald-500" : "border-amber-500 text-amber-500";
  const pos = side === "left" ? "left-5 -rotate-12" : side === "right" ? "right-5 rotate-12" : "left-1/2 -translate-x-1/2";
  return (
    <div
      className={`pointer-events-none absolute top-6 rounded-xl border-4 bg-white/80 px-3 py-1 text-2xl font-black tracking-widest ${color} ${pos}`}
      style={{ opacity: Math.min(1, show * 1.4) }}
    >
      {label}
    </div>
  );
}
