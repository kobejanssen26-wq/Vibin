import { useLocation } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * Lightweight route transition: the child tree is re-keyed on pathname so it
 * re-mounts and replays a short translate/fade entrance (`.route-fade`).
 * No exit animation on purpose — it would delay navigation and fight the
 * back button. A no-op under prefers-reduced-motion (CSS strips the keyframe).
 */
export function RouteFade({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="route-fade">
      {children}
    </div>
  );
}
