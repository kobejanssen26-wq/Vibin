import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { LogoMark } from "./Logo";

/* ------------------------------- Button ------------------------------- */
type Variant = "primary" | "ghost" | "dark";
export function Button({
  variant = "primary",
  loading,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
}) {
  const cls =
    variant === "primary"
      ? "btn-primary"
      : variant === "dark"
        ? "btn-dark"
        : "btn-ghost";
  return (
    <button className={`${cls} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

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
  const cls =
    variant === "primary"
      ? "btn-primary"
      : variant === "dark"
        ? "btn-dark"
        : "btn-ghost";
  return (
    <Link to={to} className={`${cls} ${className}`}>
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
      <span className="mb-1.5 block text-sm font-semibold text-ink-soft">
        {label}
      </span>
      <input className="field" {...rest} />
      {hint && !error && (
        <span className="mt-1 block text-xs text-ink-muted">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-xs font-medium text-coral-600">
          {error}
        </span>
      )}
    </label>
  );
}

/* ------------------------------ Spinner ------------------------------ */
export function Spinner({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
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
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-ink-muted">
      <LogoMark className="h-10 w-10 animate-pulse" />
      <p className="text-sm">{label}</p>
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
      <div className="mb-3 text-4xl">😕</div>
      <h2 className="text-lg font-bold">{title}</h2>
      {message && <p className="mt-1 text-sm text-ink-muted">{message}</p>}
      {onRetry && (
        <Button variant="ghost" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  emoji = "✨",
  title,
  message,
  action,
}: {
  emoji?: string;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-sm py-14 text-center">
      <div className="mb-3 text-4xl">{emoji}</div>
      <h2 className="text-lg font-bold">{title}</h2>
      {message && <p className="mt-1 text-sm text-ink-muted">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
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
      style={s}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  ) : (
    <span
      style={s}
      className={`grid shrink-0 place-items-center rounded-full bg-mingo-gradient font-bold text-white ${className}`}
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
          className="grid place-items-center rounded-full bg-ink text-xs font-bold text-white ring-2 ring-white"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
