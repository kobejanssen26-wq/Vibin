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

  // ui.tsx — shared primitives (default prop values; call sites can still override)
  "ui.loading": "Loading…",
  "ui.somethingWrong": "Something went wrong",
  "ui.tryAgain": "Try again",
  "ui.close": "Close",

  // AppShell.tsx — app chrome (logged-in header/nav)
  "shell.notifications": "Notifications",
  "shell.notificationsUnread": "Notifications, {n} unread",
  "shell.help": "Help & support",
  "shell.logout": "Log out",
  "shell.menu": "Menu",
  "shell.settings": "Settings",
  "shell.newGroup": "New group",
  "shell.noNotifications": "Nothing yet. You'll hear about matches, invites and messages here.",
  "shell.profileSettings": "Profile & settings",
  "shell.accountMenu": "Account menu",
  "shell.home": "VIBIN home",

  // Landing.tsx — marketing homepage
  "landing.nav.login": "Log in",
  "landing.nav.getStarted": "Get started",
  "landing.hero.title1": "Find your vibe.",
  "landing.hero.title2": "Make a plan.",
  "landing.hero.subhead":
    "Your group swipes on real activities. It only matches when everyone's in. Then VIBIN locks the time and the booking.",
  "landing.hero.cta.create": "Create a group",
  "landing.hero.cta.join": "Join a group",
  "landing.hero.disclaimer": "Free to use. No card. Built in the EU.",
  "landing.hero.card.match": "Everyone's in",
  "landing.mechanism.title1": "It doesn't count until",
  "landing.mechanism.title2": "everyone's in.",
  "landing.mechanism.body":
    "No majority vote. No loudest voice. An activity matches only when every person in the group liked it, so nobody gets talked into it.",
  "landing.mechanism.matchLabel": "Match.",
  "landing.steps.title": "Three steps, no chat chaos",
  "landing.steps.1.title": "Set the vibe",
  "landing.steps.1.body": "Categories, area, budget, and a date if you have one. Two taps if you don't care.",
  "landing.steps.2.title": "Everyone swipes",
  "landing.steps.2.body": "Each person swipes on their own phone. No group chat, no one dominating the plan.",
  "landing.steps.3.title": "It becomes a plan",
  "landing.steps.3.body": "A match needs everyone. Then VIBIN finds a time that works and hands you the booking link.",
  "landing.plan.title": "A match becomes a plan, on its own.",
  "landing.plan.body":
    "The moment your group agrees, VIBIN turns it into something you can actually show up to: a place, a time, and a way to book it.",
  "landing.plan.bookNow": "Book now",
  "landing.category.title": "Plan anything",
  "landing.category.subhead": "Twelve categories, or one tap for the whole catalogue.",
  "landing.why.title": "Why groups stick with it",
  "landing.why.subhead": "The mechanics are the point. Small choices that change how a group decides.",
  "landing.why.1.title": "Unanimous by design",
  "landing.why.1.body":
    "Majority rules is how someone always ends up bailing. One pass and it's not a match, so the plan is one everyone actually chose.",
  "landing.why.2.title": "Nobody sees who passed",
  "landing.why.2.body":
    "VIBIN shows the group result, never the individual votes. So people swipe honestly instead of politely.",
  "landing.why.3.title": "Real places, real prices",
  "landing.why.3.body":
    "A curated Belgian catalogue with real providers, honest pricing and booking links. Nothing invented to fill a card.",
  "landing.faq.title": "Good to know",
  "landing.faq.1.q": "Is this a dating app?",
  "landing.faq.1.a": "No. VIBIN matches activities and dates for a group you already have. It never matches people.",
  "landing.faq.2.q": "Do we need to pick a date first?",
  "landing.faq.2.a":
    "No. Choose “we don't know yet” and VIBIN runs a quick second round to find a time once you've matched an activity.",
  "landing.faq.3.q": "What if we can't agree on anything?",
  "landing.faq.3.a":
    "You keep swiping, and you can widen the filters any time: more categories, bigger radius, higher budget. VIBIN never forces a match.",
  "landing.faq.4.q": "Can one person block the whole group?",
  "landing.faq.4.a":
    "A match needs every active member. If someone is genuinely flexible, the creator can mark them inactive so they don't hold things up. It's a deliberate choice, never automatic.",
  "landing.faq.5.q": "Where does it work?",
  "landing.faq.5.a":
    "The first catalogue covers Belgium: Antwerp, Brussels, Ghent, Leuven, Bruges and around. It's built to add more places and providers.",
  "landing.cta.title1": "Stop planning. Start",
  "landing.cta.title2": "doing.",
  "landing.cta.body": "A group takes thirty seconds. Send the link, and your first match is a few swipes away.",
  "landing.cta.button": "Create a group",

  // Auth pages
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.login.title": "Welcome back",
  "auth.login.subtitle": "Log in to keep planning with your group.",
  "auth.login.newHere": "New here?",
  "auth.login.createAccount": "Create an account",
  "auth.login.submit": "Log in",
  "auth.login.forgot": "Forgot your password?",
  "auth.login.error": "Could not sign in.",
  "auth.signup.title": "Create your account",
  "auth.signup.subtitle": "One account, unlimited groups.",
  "auth.signup.haveOne": "Already have one?",
  "auth.signup.yourName": "Your name",
  "auth.signup.passwordHint": "At least {min} characters.",
  "auth.signup.submit": "Create account",
  "auth.signup.error": "Could not create account.",
  "auth.signup.terms": "By continuing you agree to our",
  "auth.signup.and": "and",
  "auth.signup.termsLink": "Terms",
  "auth.signup.privacyLink": "Privacy Policy",
  "auth.forgot.title": "Reset your password",
  "auth.forgot.subtitle": "We'll email you a link to set a new one.",
  "auth.forgot.backToLogin": "Back to log in",
  "auth.forgot.sent": "If an account exists for {email}, a reset link is on its way. Check your inbox (and spam). The link expires in an hour.",
  "auth.forgot.submit": "Send reset link",
  "auth.reset.title": "Choose a new password",
  "auth.reset.newPassword": "New password",
  "auth.reset.submit": "Update password",
  "auth.reset.error": "Could not reset.",
  "auth.reset.missingToken": "This link is missing its token. Request a new one from",
  "auth.reset.here": "here",
  "auth.reset.done": "Password updated. Redirecting you to log in…",
  "auth.verify.working": "Verifying…",
  "auth.verify.ok": "Email verified 🎉",
  "auth.verify.failed": "Verification failed",
  "auth.verify.goToVibin": "Go to VIBIN",
  "auth.verify.workingBody": "One moment while we confirm your email address.",
  "auth.verify.okBody": "Your email address is confirmed. You're all set.",
  "auth.verify.missingToken": "This verification link is missing its token.",
  "auth.verify.error": "Could not verify this link.",
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

  "ui.loading": "Bezig met laden…",
  "ui.somethingWrong": "Er ging iets mis",
  "ui.tryAgain": "Opnieuw proberen",
  "ui.close": "Sluiten",

  "shell.notifications": "Meldingen",
  "shell.notificationsUnread": "Meldingen, {n} ongelezen",
  "shell.help": "Help & ondersteuning",
  "shell.logout": "Uitloggen",
  "shell.menu": "Menu",
  "shell.settings": "Instellingen",
  "shell.newGroup": "Nieuwe groep",
  "shell.noNotifications": "Nog niets. Hier hoor je over matches, uitnodigingen en berichten.",
  "shell.profileSettings": "Profiel & instellingen",
  "shell.accountMenu": "Accountmenu",
  "shell.home": "VIBIN home",

  "landing.nav.login": "Inloggen",
  "landing.nav.getStarted": "Aan de slag",
  "landing.hero.title1": "Vind je vibe.",
  "landing.hero.title2": "Maak een plan.",
  "landing.hero.subhead":
    "Je groep swipet op echte activiteiten. Er is pas een match als iedereen mee is. Daarna legt VIBIN het tijdstip en de boeking vast.",
  "landing.hero.cta.create": "Maak een groep",
  "landing.hero.cta.join": "Sluit je aan bij een groep",
  "landing.hero.disclaimer": "Gratis te gebruiken. Geen kaart nodig. Gebouwd in de EU.",
  "landing.hero.card.match": "Iedereen is mee",
  "landing.mechanism.title1": "Het telt pas als",
  "landing.mechanism.title2": "iedereen mee is.",
  "landing.mechanism.body":
    "Geen meerderheidsstem. Geen luidste stem. Een activiteit matcht pas als elk lid van de groep ze leuk vond, zodat niemand ergens toe overgehaald wordt.",
  "landing.mechanism.matchLabel": "Match.",
  "landing.steps.title": "Drie stappen, geen chatgedoe",
  "landing.steps.1.title": "Zet de sfeer",
  "landing.steps.1.body": "Categorieën, regio, budget en een datum als je die al hebt. Twee tikken als het je niet uitmaakt.",
  "landing.steps.2.title": "Iedereen swipet",
  "landing.steps.2.body": "Elke persoon swipet op zijn eigen telefoon. Geen groepschat, niemand die het plan overneemt.",
  "landing.steps.3.title": "Het wordt een plan",
  "landing.steps.3.body": "Een match heeft iedereen nodig. Daarna zoekt VIBIN een tijdstip dat past en geeft je de boekingslink.",
  "landing.plan.title": "Een match wordt vanzelf een plan.",
  "landing.plan.body":
    "Zodra je groep het eens is, maakt VIBIN er iets van waar je echt naartoe kan: een plek, een tijdstip en een manier om te boeken.",
  "landing.plan.bookNow": "Nu boeken",
  "landing.category.title": "Plan om het even wat",
  "landing.category.subhead": "Twaalf categorieën, of één tik voor de hele catalogus.",
  "landing.why.title": "Waarom groepen erbij blijven",
  "landing.why.subhead": "De mechanica is het hele punt. Kleine keuzes die veranderen hoe een groep beslist.",
  "landing.why.1.title": "Unaniem, met opzet",
  "landing.why.1.body":
    "Bij een meerderheidsstem haakt er altijd wel iemand af. Eén keer 'nee' en het is geen match, dus het plan is er een dat iedereen echt gekozen heeft.",
  "landing.why.2.title": "Niemand ziet wie er nee zei",
  "landing.why.2.body":
    "VIBIN toont het groepsresultaat, nooit de individuele stemmen. Zo swipet iedereen eerlijk in plaats van beleefd.",
  "landing.why.3.title": "Echte plekken, echte prijzen",
  "landing.why.3.body":
    "Een uitgekozen Belgische catalogus met echte aanbieders, eerlijke prijzen en boekingslinks. Niets verzonnen om een kaart te vullen.",
  "landing.faq.title": "Goed om te weten",
  "landing.faq.1.q": "Is dit een datingapp?",
  "landing.faq.1.a": "Nee. VIBIN matcht activiteiten en data voor een groep die je al hebt. Het matcht nooit mensen.",
  "landing.faq.2.q": "Moeten we eerst een datum kiezen?",
  "landing.faq.2.a":
    "Nee. Kies ‘we weten het nog niet’ en VIBIN doet een korte tweede ronde om een tijdstip te vinden zodra jullie een activiteit gematcht hebben.",
  "landing.faq.3.q": "Wat als we het nergens over eens raken?",
  "landing.faq.3.a":
    "Je blijft swipen en kan de filters altijd verruimen: meer categorieën, grotere straal, hoger budget. VIBIN forceert nooit een match.",
  "landing.faq.4.q": "Kan één persoon de hele groep blokkeren?",
  "landing.faq.4.a":
    "Een match heeft elk actief lid nodig. Als iemand echt flexibel is, kan de maker die persoon op inactief zetten zodat die niet ophoudt. Een bewuste keuze, nooit automatisch.",
  "landing.faq.5.q": "Waar werkt het?",
  "landing.faq.5.a":
    "De eerste catalogus dekt België: Antwerpen, Brussel, Gent, Leuven, Brugge en omgeving. Gebouwd om meer plekken en aanbieders toe te voegen.",
  "landing.cta.title1": "Stop met plannen. Begin met",
  "landing.cta.title2": "doen.",
  "landing.cta.body": "Een groep maken duurt dertig seconden. Stuur de link, en je eerste match is maar een paar swipes ver.",
  "landing.cta.button": "Maak een groep",

  "auth.email": "E-mail",
  "auth.password": "Wachtwoord",
  "auth.login.title": "Welkom terug",
  "auth.login.subtitle": "Log in om verder te plannen met je groep.",
  "auth.login.newHere": "Nieuw hier?",
  "auth.login.createAccount": "Account aanmaken",
  "auth.login.submit": "Inloggen",
  "auth.login.forgot": "Wachtwoord vergeten?",
  "auth.login.error": "Inloggen is niet gelukt.",
  "auth.signup.title": "Maak je account",
  "auth.signup.subtitle": "Eén account, onbeperkt aantal groepen.",
  "auth.signup.haveOne": "Heb je er al een?",
  "auth.signup.yourName": "Je naam",
  "auth.signup.passwordHint": "Minstens {min} tekens.",
  "auth.signup.submit": "Account aanmaken",
  "auth.signup.error": "Account aanmaken is niet gelukt.",
  "auth.signup.terms": "Door verder te gaan ga je akkoord met onze",
  "auth.signup.and": "en ons",
  "auth.signup.termsLink": "Voorwaarden",
  "auth.signup.privacyLink": "Privacybeleid",
  "auth.forgot.title": "Wachtwoord opnieuw instellen",
  "auth.forgot.subtitle": "We mailen je een link om een nieuw wachtwoord in te stellen.",
  "auth.forgot.backToLogin": "Terug naar inloggen",
  "auth.forgot.sent": "Als er een account bestaat voor {email}, is er een resetlink onderweg. Check je inbox (en spam). De link verloopt na een uur.",
  "auth.forgot.submit": "Resetlink versturen",
  "auth.reset.title": "Kies een nieuw wachtwoord",
  "auth.reset.newPassword": "Nieuw wachtwoord",
  "auth.reset.submit": "Wachtwoord bijwerken",
  "auth.reset.error": "Instellen is niet gelukt.",
  "auth.reset.missingToken": "Deze link mist zijn token. Vraag een nieuwe aan via",
  "auth.reset.here": "hier",
  "auth.reset.done": "Wachtwoord bijgewerkt. Je wordt doorgestuurd naar inloggen…",
  "auth.verify.working": "Bezig met verifiëren…",
  "auth.verify.ok": "E-mail geverifieerd 🎉",
  "auth.verify.failed": "Verificatie mislukt",
  "auth.verify.goToVibin": "Naar VIBIN",
  "auth.verify.workingBody": "Even geduld terwijl we je e-mailadres bevestigen.",
  "auth.verify.okBody": "Je e-mailadres is bevestigd. Je bent helemaal klaar.",
  "auth.verify.missingToken": "Deze verificatielink mist zijn token.",
  "auth.verify.error": "Deze link kon niet geverifieerd worden.",
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

type Vars = Record<string, string | number>;
const interpolate = (s: string, vars?: Vars) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;

const Ctx = createContext<{ lang: LangCode; setLang: (l: LangCode) => void; t: (k: Key, vars?: Vars) => string }>({
  lang: "en",
  setLang: () => {},
  t: (k, vars) => interpolate(EN[k], vars),
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
      t: (k: Key, vars?: Vars) => interpolate(DICTIONARIES[lang]?.[k] ?? EN[k], vars),
    }),
    [lang],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}
