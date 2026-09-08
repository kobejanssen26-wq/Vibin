import { forwardRef, useEffect } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconClose } from "./icons";

/* ------------------------------- Button ------------------------------- */
type Variant = "primary" | "lime" | "ghost" | "dark" | "outline";
const VARIANT: Record<Variant, string> = {
  primary: "btn-primary",
  lime: "btn-lime",
  ghost: "btn-ghost",
  dark: "btn-dark",
  outline: "btn-outline",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    loading?: boolean;
  }
>(function Button(
  { variant = "primary", loading, className = "", children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${VARIANT[variant]} ${className}`}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

export function LinkButton({
  to,
  variant = "primary",
  className = "",
  children,
}: {
  to: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={`${VARIANT[variant]} ${className}`}>
      {children}
    </Link>
  );
}

/* ------------------------------- Field ------------------------------- */
export function Field({
  label,
  hint,
  error,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-navy-700">
        {label}
      </span>
      <input
        className={`field ${error ? "border-danger-400 focus:ring-danger-400/25" : ""}`}
        aria-invalid={!!error}
        {...rest}
      />
      {hint && !error && (
        <span className="mt-1 block text-xs text-navy-400">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-xs font-medium text-danger-600">
          {error}
        </span>
      )}
    </label>
  );
}

/* ------------------------------ Spinner ------------------------------ */
export function Spinner({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className} motion-reduce:animate-none`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z"
      />
    </svg>
  );
}

/* ---------------------------- Page states --------------------------- */
export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-[55vh] flex-col items-center justify-center gap-4 text-navy-400"
      role="status"
      aria-live="polite"
    >
      <Spinner className="h-6 w-6 text-brand-500" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`card overflow-hidden ${className}`}>
      <div className="skeleton h-40 w-full rounded-none" />
      <div className="space-y-2.5 p-4">
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-3 w-1/2" />
        <div className="skeleton h-3 w-full" />
      </div>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mx-auto max-w-sm py-16 text-center">
      <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl border border-danger-100 bg-danger-50 text-danger-500">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 8v5M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="text-[15px] font-bold">{title}</h2>
      {message && <p className="mt-1.5 text-sm text-navy-400">{message}</p>}
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-sm py-16 text-center">
      <h2 className="text-[15px] font-bold">{title}</h2>
      {message && (
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-navy-400">{message}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* --------------------------- Section head --------------------------- */
export function SectionHead({
  label,
  count,
  action,
}: {
  label: string;
  count?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between px-1">
      <h2 className="flex items-center gap-2 eyebrow">
        {label}
        {count != null && (
          <span className="rounded-full bg-paper-soft px-1.5 py-0.5 text-[11px] font-bold text-navy-400">
            {count}
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}

/* ------------------------------- Modal ------------------------------ */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-navy/45 p-4 motion-safe:animate-enter-fade sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card-raised w-full max-w-sm animate-slide-up p-5">
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-full text-navy-400 hover:bg-navy/5"
          >
            <IconClose size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------ Avatars ----------------------------- */
export function Avatar({
  name,
  url,
  size = 40,
  className = "",
}: {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  const s = { width: size, height: size, fontSize: size * 0.38 };
  const ini = name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return url ? (
    <img
      src={url}
      alt={name}
      loading="lazy"
      style={s}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  ) : (
    <span
      style={s}
      className={`grid shrink-0 place-items-center rounded-full bg-brand-500 font-bold text-white ${className}`}
      aria-label={name}
    >
      {ini}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 6,
  size = 34,
}: {
  people: { displayName: string; avatarUrl: string | null }[];
  max?: number;
  size?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <div key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}>
          <Avatar
            name={p.displayName}
            url={p.avatarUrl}
            size={size}
            className="ring-2 ring-white"
          />
        </div>
      ))}
      {extra > 0 && (
        <span
          style={{ width: size, height: size, marginLeft: -size * 0.3 }}
          className="grid place-items-center rounded-full bg-navy text-xs font-bold text-white ring-2 ring-white"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
