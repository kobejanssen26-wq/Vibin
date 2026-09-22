import { useState } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "./Logo";
import { useLang, LANGUAGES } from "../lib/i18n";
import { IconGlobe } from "./icons";

/**
 * The marketing site's footer (§14/§15). Every link goes to a page that
 * genuinely exists — no "Partner worden", "Cookiebeleid" or social icons:
 * VIBIN doesn't have those pages or live social accounts yet, and a footer
 * link to nothing is worse than a shorter footer (§14: "NO DEAD LINKS").
 * Add those columns back once the pages/accounts are real.
 */
export function SiteFooter() {
  const { t } = useLang();
  return (
    <footer className="border-t border-paper-line bg-paper-soft/40">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-[22ch] text-sm leading-relaxed text-navy-400">
              {t("footer.tagline")}
            </p>
          </div>

          <FooterCol title={t("footer.vibin")}>
            <FooterLink to="/#how-it-works">{t("footer.howItWorks")}</FooterLink>
            <FooterLink to="/contact">{t("footer.contact")}</FooterLink>
          </FooterCol>

          <FooterCol title={t("footer.help")}>
            <FooterLink to="/#faq">{t("footer.helpCenter")}</FooterLink>
            <FooterLink to="/contact">{t("footer.reportIssue")}</FooterLink>
          </FooterCol>

          <FooterCol title={t("footer.legal")}>
            <FooterLink to="/privacy">{t("footer.privacy")}</FooterLink>
            <FooterLink to="/terms">{t("footer.terms")}</FooterLink>
          </FooterCol>
        </div>

        <div className="mt-12 flex flex-col items-center gap-4 border-t border-paper-line pt-6 sm:flex-row sm:justify-between">
          <p className="text-xs text-navy-400">
            © {new Date().getFullYear()} VIBIN. {t("footer.rights")}
          </p>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link to="/login" className="text-xs font-semibold text-navy-500 hover:text-navy">
              {t("footer.login")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-navy-400">{title}</h3>
      <ul className="mt-3 space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="text-sm text-navy-500 hover:text-navy">
        {children}
      </Link>
    </li>
  );
}

function LanguageSwitcher() {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t("footer.language")}: ${LANGUAGES.find((l) => l.code === lang)?.label}`}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-navy-500 hover:bg-paper-card hover:text-navy"
      >
        <IconGlobe size={15} aria-hidden="true" />
        {LANGUAGES.find((l) => l.code === lang)?.label}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close language menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <ul
            role="listbox"
            className="absolute bottom-full right-0 z-20 mb-2 w-40 overflow-hidden rounded-xl border border-paper-line bg-paper-card py-1 shadow-card"
          >
            {LANGUAGES.map((l) => (
              <li key={l.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={l.code === lang}
                  onClick={() => {
                    setLang(l.code);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-paper-soft ${
                    l.code === lang ? "font-bold text-brand-500" : "text-navy-600"
                  }`}
                >
                  {l.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
