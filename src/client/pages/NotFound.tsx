import { Link } from "react-router-dom";
import { LogoMark } from "../components/Logo";

export function NotFound() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-5 py-20 text-center">
      <LogoMark className="h-12 w-12" />
      <h1 className="mt-4 text-3xl font-extrabold">Nothing here</h1>
      <p className="mt-1 text-sm text-navy-400">
        This page doesn’t exist, or the link has expired.
      </p>
      <Link to="/" className="btn-primary mt-6">
        Back to VIBIN
      </Link>
    </div>
  );
}
