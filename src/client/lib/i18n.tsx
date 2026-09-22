import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * VIBIN's i18n architecture. English is the language every surface is
 * actually written in today; this makes that official as the fallback
 * instead of leaving it implicit, and gives every other supported language
 * a real, working switch — never a language that LOOKS fully translated
 * but silently isn't (§13: "als een taal nog niet volledig vertaald is,
 * niet doen alsof alles vertaald is").
 *
 * Scope, honestly: only the surfaces listed in DICTIONARIES below are
 * actually translated per language right now (the marketing footer and the
 * switcher itself). Every other string in the app is still English literals
 * in place, same as before this file existed — t() falls back to the key's
 * English copy for anything not in the active language's table, so nothing
 * ever renders blank or as a raw key.
 */
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "nl", label: "Nederlands" },
  { code: "fr", label: "Français" },
] as const;
export type LangCode = (typeof LANGUAGES)[number]["code"];

const EN = {
  "footer.vibin": "VIBIN",
  "footer.about": "About VIBIN",
  "footer.howItWorks": "How it works",
  "footer.contact": "Contact",
  "footer.help": "Help",
  "footer.helpCenter": "Help & FAQ",
  "footer.reportIssue": "Report a problem",
  "footer.legal": "Legal",
  "footer.privacy": "Privacy",
  "footer.terms": "Terms",
  "footer.language": "Language",
  "footer.login": "Log in",
  "footer.tagline": "Group plans, minus the group chat chaos.",
  "footer.rights": "All rights reserved.",
} satisfies Record<string, string>;

type Key = keyof typeof EN;

const NL: Partial<Record<Key, string>> = {
  "footer.about": "Over VIBIN",
  "footer.howItWorks": "Hoe het werkt",
  "footer.contact": "Contact",
  "footer.help": "Help",
  "footer.helpCenter": "Help & veelgestelde vragen",
  "footer.reportIssue": "Probleem melden",
  "footer.legal": "Juridisch",
  "footer.privacy": "Privacy",
  "footer.terms": "Voorwaarden",
  "footer.language": "Taal",
  "footer.login": "Inloggen",
  "footer.tagline": "Groepsplannen, zonder de chaos van de groepschat.",
  "footer.rights": "Alle rechten voorbehouden.",
};

const FR: Partial<Record<Key, string>> = {
  "footer.about": "À propos de VIBIN",
  "footer.howItWorks": "Comment ça marche",
  "footer.contact": "Contact",
  "footer.help": "Aide",
  "footer.helpCenter": "Aide & FAQ",
  "footer.reportIssue": "Signaler un problème",
  "footer.legal": "Mentions légales",
  "footer.privacy": "Confidentialité",
  "footer.terms": "Conditions",
  "footer.language": "Langue",
  "footer.login": "Connexion",
  "footer.tagline": "Des plans de groupe, sans le chaos du chat de groupe.",
  "footer.rights": "Tous droits réservés.",
};

const DICTIONARIES: Record<LangCode, Partial<Record<Key, string>>> = { en: EN, nl: NL, fr: FR };
const STORAGE_KEY = "vibin_lang";

const Ctx = createContext<{ lang: LangCode; setLang: (l: LangCode) => void; t: (k: Key) => string }>({
  lang: "en",
  setLang: () => {},
  t: (k) => EN[k],
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && LANGUAGES.some((l) => l.code === saved)) return saved as LangCode;
    } catch {
      /* private mode / blocked storage — English default is fine */
    }
    return "en";
  });

  const setLang = (l: LangCode) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* per-viewer convenience only — nothing depends on this persisting */
    }
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      // English is the always-complete base; other languages only override
      // the keys they actually have — this IS the fallback, not a bug path.
      t: (k: Key) => DICTIONARIES[lang]?.[k] ?? EN[k],
    }),
    [lang],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}
