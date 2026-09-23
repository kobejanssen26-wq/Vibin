import { useLang } from "../lib/i18n";

/** Skeleton for the swipe screen — mirrors the real layout so nothing jumps. */
export function SwipeSkeleton() {
  const { t } = useLang();
  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col" aria-busy="true" aria-label={t("swipe.skeletonLabel")}>
      <div className="mb-3 flex items-center justify-between">
        <div className="skeleton h-8 w-20" />
        <div className="skeleton h-7 w-24 rounded-full" />
      </div>
      <div className="relative mx-auto aspect-[3/4.1] w-full max-w-sm flex-1">
        <div className="card-raised absolute inset-0 overflow-hidden">
          <div className="skeleton h-[56%] w-full rounded-none" />
          <div className="space-y-2.5 p-4">
            <div className="flex gap-2">
              <div className="skeleton h-8 w-28 rounded-full" />
              <div className="skeleton h-8 w-16 rounded-full" />
            </div>
            <div className="skeleton h-3.5 w-full" />
            <div className="skeleton h-3.5 w-11/12" />
            <div className="skeleton h-3.5 w-2/3" />
          </div>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-center gap-4">
        {[16, 12, 12, 16].map((s, i) => (
          <div key={i} className="skeleton rounded-full" style={{ width: s * 4, height: s * 4 }} />
        ))}
      </div>
    </div>
  );
}
