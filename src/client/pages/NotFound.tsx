import { Link } from "react-router-dom";
import { LogoMark } from "../components/Logo";
import { useLang } from "../lib/i18n";

export function NotFound() {
  const { t } = useLang();
  return (
    <div className="relative min-h-full overflow-x-clip bg-paper">
      <div className="pointer-events-none absolute inset-0 bg-vibin-hero" />
      <div className="relative mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-5 py-20 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-3xl border border-paper-line bg-paper-card">
          <LogoMark className="h-9 w-9" />
        </span>
        <h1 className="mt-5 text-3xl font-extrabold tracking-[-0.02em]">
          {t("notFound.title")}
        </h1>
        <p className="mt-2 max-w-xs text-sm text-navy-400">
          {t("notFound.body")}
        </p>
        <Link to="/" className="btn-primary mt-6">
          {t("notFound.back")}
        </Link>
      </div>
    </div>
  );
}
