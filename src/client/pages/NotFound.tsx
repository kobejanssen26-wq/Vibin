import { Link } from "react-router-dom";
import { LogoMark } from "../components/Logo";

export function NotFound() {
  return (
    <div className="min-h-full bg-paper">
      <div className="route-fade mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-5 py-20 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-xl border border-paper-line bg-paper-card">
          <LogoMark className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-[-0.02em]">
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
