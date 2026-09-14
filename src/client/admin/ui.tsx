import {
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

/* ------------------------------- layout ------------------------------- */

export function Panel({
  title,
  subtitle,
  right,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-slate-200 bg-white ${className}`}
    >
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13px] font-semibold text-slate-900">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function PageTitle({
  title,
  right,
  crumbs,
}: {
  title: string;
  right?: ReactNode;
  crumbs?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {crumbs && <div className="mb-1 text-xs text-slate-500">{crumbs}</div>}
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/* -------------------------------- stats ------------------------------- */

export function StatTile({
  label,
  value,
  hint,
  delta,
  href,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: number | null;
  href?: string;
  onClick?: () => void;
}) {
  const clickable = !!(href || onClick);
  const body = (
    <>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
        {delta != null && Number.isFinite(delta) && (
          <span
            className={
              delta > 0
                ? "font-semibold text-emerald-600"
                : delta < 0
                  ? "font-semibold text-rose-600"
                  : "text-slate-400"
            }
          >
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="truncate">{hint}</span>}
      </div>
    </>
  );
  const cls =
    "block rounded-lg border border-slate-200 bg-white p-3 text-left" +
    (clickable
      ? " transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-[0_8px_20px_-12px_rgba(49,85,255,0.35)] active:translate-y-0"
      : "");
  if (href)
    return (
      <a href={href} className={cls}>
        {body}
      </a>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}

/* ------------------------------- controls ---------------------------- */

const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1";
const btnVariants = {
  primary: "bg-brand-500 text-white hover:bg-brand-600",
  neutral: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  ghost: "text-slate-600 hover:bg-slate-100",
} as const;

export function Btn({
  variant = "neutral",
  className = "",
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof btnVariants;
  loading?: boolean;
}) {
  return (
    <button
      className={`${btnBase} ${btnVariants[variant]} ${className}`}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <Spinner size={13} />}
      {children}
    </button>
  );
}

export function Input({
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${className}`}
      {...rest}
    />
  );
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[13px] text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-700">
        {label}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-xs font-medium text-rose-600">
          {error}
        </span>
      )}
    </label>
  );
}

/* -------------------------------- badges ---------------------------- */

const toneMap: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  blue: "bg-brand-50 text-brand-700 ring-brand-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-rose-50 text-rose-700 ring-rose-600/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20",
  lime: "bg-lime-100 text-lime-800 ring-lime-600/30",
};

export function Badge({
  tone = "slate",
  children,
}: {
  tone?: keyof typeof toneMap;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${toneMap[tone]}`}
    >
      {children}
    </span>
  );
}

/* --------------------------------- table --------------------------- */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}
export function Th({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${className}`}
    >
      {children}
    </th>
  );
}
export function Td({
  children,
  className = "",
  mono,
}: {
  children?: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <td
      className={`border-b border-slate-100 px-3 py-2 align-middle ${
        mono ? "font-mono text-xs text-slate-600" : "text-slate-800"
      } ${className}`}
    >
      {children}
    </td>
  );
}
export function Tr({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <tr
      className={`transition-colors duration-100 hover:bg-slate-50 ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function Pager({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
      <span>
        {total.toLocaleString()} row{total === 1 ? "" : "s"}
      </span>
      <span className="flex items-center gap-1">
        <Btn
          variant="ghost"
          className="!px-2 !py-1"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          ‹ Prev
        </Btn>
        <span className="px-2">
          {page} / {Math.max(1, pageCount)}
        </span>
        <Btn
          variant="ghost"
          className="!px-2 !py-1"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next ›
        </Btn>
      </span>
    </div>
  );
}

/* -------------------------------- states --------------------------- */

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin motion-reduce:animate-none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-20"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorNote({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
      <span>{message}</span>
      {onRetry && (
        <Btn variant="neutral" className="!py-1" onClick={onRetry}>
          Retry
        </Btn>
      )}
    </div>
  );
}

export function NotEnough({ label = "Not enough data yet" }: { label?: string }) {
  return (
    <div className="py-10 text-center text-sm text-slate-400">{label}</div>
  );
}

/* ------------------------------ tiny chart ------------------------ */

export function MiniBars({
  data,
  height = 40,
  color = "var(--brand)",
}: {
  data: number[];
  height?: number;
  color?: string;
}) {
  if (!data.length) return <NotEnough />;
  const max = Math.max(1, ...data);
  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{
            height: `${Math.max(2, (v / max) * height)}px`,
            background: color,
            opacity: 0.85,
          }}
          title={String(v)}
        />
      ))}
    </div>
  );
}

export function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function fmtDate(sec: number | null | undefined): string {
  if (!sec) return "—";
  return new Date(sec * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDay(sec: number | null | undefined): string {
  if (!sec) return "—";
  return new Date(sec * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
