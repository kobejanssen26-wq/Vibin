import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "../components/Logo";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative min-h-full bg-paper">
      <div className="pointer-events-none absolute inset-0 bg-vibin-hero" />
      <div className="pointer-events-none absolute -left-24 top-24 h-64 w-64 rounded-full bg-brand-400/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-8 h-56 w-56 rounded-full bg-lime-400/20 blur-3xl" />

      <div className="safe-t safe-b relative mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-12">
        <Link
          to="/"
          className="mx-auto mb-8 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <Wordmark />
        </Link>
        <div className="card-raised p-6">
          <h1 className="text-xl font-extrabold tracking-[-0.02em]">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-navy-400">{subtitle}</p>
          )}
          <div className="mt-6">{children}</div>
        </div>
        {footer && (
          <p className="mt-4 text-center text-sm text-navy-400">{footer}</p>
        )}
      </div>
    </div>
  );
}
