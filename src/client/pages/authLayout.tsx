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
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-10">
      <Link to="/" className="mx-auto mb-8">
        <Wordmark />
      </Link>
      <div className="card p-6">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-navy-400">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
      {footer && (
        <p className="mt-4 text-center text-sm text-navy-400">{footer}</p>
      )}
    </div>
  );
}
