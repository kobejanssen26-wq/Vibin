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
    <div className="min-h-full bg-paper">
      <div className="safe-t safe-b mx-auto flex min-h-full max-w-sm flex-col justify-center px-5 py-12">
        <Link
          to="/"
          className="mx-auto mb-8 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <Wordmark />
        </Link>
        <div className="route-fade rounded-2xl border border-paper-line bg-paper-card p-6">
          <h1 className="text-lg font-extrabold tracking-[-0.02em]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-navy-400">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && (
          <p className="mt-4 text-center text-sm text-navy-400">{footer}</p>
        )}
      </div>
    </div>
  );
}
