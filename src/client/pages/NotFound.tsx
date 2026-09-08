import { Link } from "react-router-dom";
import { LogoMark } from "../components/Logo";

export function NotFound() {
  return (
    <div className="relative min-h-full bg-paper">
      <div className="pointer-events-none absolute inset-0 bg-vibin-hero" />
      <div className="relative mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-5 py-20 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-3xl border border-paper-line bg-paper-card">
          <LogoMark className="h-9 w-9" />
        </span>
        <h1 className="mt-5 text-3xl font-extrabold tracking-[-0.02em]">
          Nothing here
        </h1>
        <p className="mt-2 max-w-xs text-sm text-navy-400">
          This page doesn't exist, or the link has expired.
        </p>
        <Link to="/" className="btn-primary mt-6">
          Back to VIBIN
        </Link>
      </div>
    </div>
  );
}
