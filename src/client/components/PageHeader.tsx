import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconArrowLeft } from "./icons";

/**
 * One header treatment for every in-app screen: optional back link, title,
 * optional one-line subtitle, optional right-aligned action. Keeps rhythm
 * identical across Swipe / Group / Config / Date / Plan / Profile / Admin.
 */
export function PageHeader({
  back,
  title,
  subtitle,
  action,
}: {
  back?: { to: string; label: string };
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5">
      {back && (
        <Link
          to={back.to}
          className="-ml-2 mb-1 inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-navy-500 transition hover:bg-navy/5 hover:text-navy"
        >
          <IconArrowLeft size={18} />
          <span className="max-w-[60vw] truncate">{back.label}</span>
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.01em]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-navy-400">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
