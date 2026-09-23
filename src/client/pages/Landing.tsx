import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "../components/Logo";
import { SiteFooter } from "../components/SiteFooter";
import { LinkButton } from "../components/ui";
import { Reveal } from "../components/Reveal";
import { SwipeCard } from "../components/SwipeCard";
import { AvatarStack } from "../components/ui";
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconExternal,
  IconMapPin,
} from "../components/icons";
import { demoActivity, demoNextActivity } from "../lib/demo";
import { ACTIVITY_CATEGORIES } from "@shared/constants";
import { labelFor, useLang } from "../lib/i18n";

const CREW = [
  { initials: "KJ", tone: "bg-brand-500" },
  { initials: "LP", tone: "bg-brand-600" },
  { initials: "SD", tone: "bg-navy-700" },
  { initials: "MV", tone: "bg-brand-400" },
  { initials: "EW", tone: "bg-navy-800" },
];

const STEPS = ["1", "2", "3"] as const;
const WHY = ["1", "2", "3"] as const;
const FAQ = ["1", "2", "3", "4", "5"] as const;

export function Landing() {
  const { t } = useLang();
  return (
    <div className="min-h-full overflow-x-clip bg-paper text-navy">
      {/* ---------- nav ---------- */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Wordmark />
        <nav className="flex items-center gap-2 text-sm font-semibold">
          <Link to="/login" className="rounded-xl px-3 py-2 text-navy-500 hover:text-navy">
            {t("landing.nav.login")}
          </Link>
          <Link to="/signup" className="btn-primary px-4 py-2">
            {t("landing.nav.getStarted")}
          </Link>
        </nav>
      </header>

      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-vibin-hero" />
        <div className="pointer-events-none absolute inset-0 dot-grid text-navy/[0.05]" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 md:grid-cols-[1.12fr_0.88fr] md:gap-14 md:pb-24 md:pt-12">
          <div>
            <Reveal>
              <h1 className="text-5xl font-extrabold leading-[0.95] tracking-[-0.035em] [text-wrap:balance] sm:text-[3.4rem] md:text-[3.6rem] lg:text-[4.4rem]">
                <span className="block">{t("landing.hero.title1")}</span>
                <span className="block text-brand-500">{t("landing.hero.title2")}</span>
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mt-5 max-w-md text-[17px] leading-relaxed text-navy-500">
                {t("landing.hero.subhead")}
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <LinkButton to="/signup" className="px-6 text-base">
                  {t("landing.hero.cta.create")}
                </LinkButton>
                <LinkButton to="/login" variant="outline" className="px-6 text-base">
                  {t("landing.hero.cta.join")}
                </LinkButton>
              </div>

              <p className="mt-4 text-xs font-medium text-navy-400">
                {t("landing.hero.disclaimer")}
              </p>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <HeroCard />
          </Reveal>
        </div>
      </section>

      {/* ---------- the mechanism (differentiator, given weight) ---------- */}
      <section className="bg-navy px-5 py-20 text-white md:py-28">
        <div className="mx-auto max-w-4xl text-center">
          <Reveal>
            <h2 className="mx-auto max-w-2xl text-3xl font-extrabold leading-tight md:text-5xl">
              {t("landing.mechanism.title1")}{" "}
              <span className="text-lime-400">{t("landing.mechanism.title2")}</span>
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-white/70">
              {t("landing.mechanism.body")}
            </p>
          </Reveal>

          <CrewStrip />
        </div>
      </section>

      {/* ---------- how it works (editorial 3-beat) ---------- */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-20 md:py-28 scroll-mt-20">
        <Reveal>
          <h2 className="text-2xl font-extrabold md:text-4xl">{t("landing.steps.title")}</h2>
        </Reveal>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-paper-line bg-paper-line md:grid-cols-3">
          {STEPS.map((k, i) => (
            <Reveal as="li" key={k} delay={i * 90} className="bg-paper-card p-7">
              <span className="text-sm font-black tracking-widest text-brand-300">
                0{i + 1}
              </span>
              <h3 className="mt-3 text-lg font-extrabold">{t(`landing.steps.${k}.title` as never)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-500">{t(`landing.steps.${k}.body` as never)}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ---------- from match to plan (the beat right after "everyone's in") ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <div className="grid items-center gap-10 md:grid-cols-[0.85fr_1.15fr] md:gap-16">
          <Reveal>
            <h2 className="text-2xl font-extrabold leading-tight md:text-4xl">
              {t("landing.plan.title")}
            </h2>
            <p className="mt-4 text-navy-500">
              {t("landing.plan.body")}
            </p>
          </Reveal>

          <Reveal delay={100}>
            <div className="overflow-hidden rounded-3xl border border-paper-line bg-paper-card shadow-sm">
              <div className="relative h-40 w-full sm:h-48">
                <img
                  src="https://museumofillusions.be/wp-content/uploads/2024/08/moi-home-carousel5-Brussels-Belgium-1200x900-1.png"
                  alt="Museum of Illusions, Brussels"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-xl bg-lime-400 px-2.5 py-1 text-xs font-extrabold text-navy shadow-lime">
                  <IconCheck size={13} /> {t("landing.hero.card.match")}
                </span>
              </div>
              <div className="p-6">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-500">
                  Museum · Brussels
                </p>
                <h3 className="mt-1 text-xl font-extrabold">Museum of Illusions</h3>

                <div className="mt-4 space-y-2 text-sm text-navy-500">
                  <p className="flex items-center gap-2">
                    <IconCalendar size={16} className="shrink-0 text-navy-400" />
                    Sat 18 Oct
                    <IconClock size={16} className="ml-2 shrink-0 text-navy-400" />
                    14:30
                  </p>
                  <p className="flex items-center gap-2">
                    <IconMapPin size={16} className="shrink-0 text-navy-400" />
                    Rue du Lombard 27, Brussels · €17.50 / person
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                  <AvatarStack
                    people={[
                      { displayName: "Kobe", avatarUrl: null },
                      { displayName: "Lina", avatarUrl: null },
                      { displayName: "Sam", avatarUrl: null },
                      { displayName: "Emma", avatarUrl: null },
                    ]}
                    size={32}
                  />
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-navy">
                    {t("landing.plan.bookNow")} <IconExternal size={14} />
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- category strip (horizontal scroll, not a grid) ---------- */}
      <section className="py-4">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <h2 className="text-2xl font-extrabold md:text-4xl">{t("landing.category.title")}</h2>
            <p className="mt-2 text-navy-500">
              {t("landing.category.subhead")}
            </p>
          </Reveal>
        </div>
        <div
          className="mt-7 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="list"
        >
          <div className="shrink-0" style={{ width: "max(1.25rem, calc((100vw - 72rem) / 2))" }} />
          {ACTIVITY_CATEGORIES.map((c, i) => (
            <div
              key={c.id}
              role="listitem"
              className={`flex w-40 shrink-0 snap-start flex-col justify-between rounded-3xl border border-paper-line bg-gradient-to-br p-5 ${
                i % 3 === 0
                  ? "from-brand-50 to-white"
                  : i % 3 === 1
                    ? "from-lime-50 to-white"
                    : "from-paper-soft to-white"
              }`}
            >
              <span className="text-3xl">{c.icon}</span>
              <span className="mt-8 font-bold leading-tight">{labelFor(t, "cat", c.id, c.label)}</span>
            </div>
          ))}
          <div className="shrink-0" style={{ width: "max(1.25rem, calc((100vw - 72rem) / 2))" }} />
        </div>
      </section>

      {/* ---------- why it's different (asymmetric) ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
          <Reveal>
            <h2 className="text-2xl font-extrabold leading-tight md:text-4xl">
              {t("landing.why.title")}
            </h2>
            <p className="mt-4 text-navy-500">
              {t("landing.why.subhead")}
            </p>
          </Reveal>
          <div className="space-y-px overflow-hidden rounded-3xl border border-paper-line bg-paper-line">
            {WHY.map((k, i) => (
              <Reveal key={k} delay={i * 80} className="bg-paper-card p-7">
                <div className="flex items-start gap-4">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-500 text-white">
                    <IconCheck size={16} />
                  </span>
                  <div>
                    <h3 className="text-base font-extrabold">{t(`landing.why.${k}.title` as never)}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-navy-500">
                      {t(`landing.why.${k}.body` as never)}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="mx-auto max-w-3xl px-5 py-16 scroll-mt-20">
        <Reveal>
          <h2 className="text-2xl font-extrabold md:text-4xl">{t("landing.faq.title")}</h2>
        </Reveal>
        <div className="mt-8 space-y-3">
          {FAQ.map((k, i) => (
            <Reveal key={k} delay={i * 50}>
              <Faq q={t(`landing.faq.${k}.q` as never)} a={t(`landing.faq.${k}.a` as never)} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] bg-vibin-match p-10 text-center text-white md:p-16">
            <div className="dot-grid pointer-events-none absolute inset-0 text-white/[0.06]" />
            <h2 className="relative text-3xl font-extrabold md:text-5xl">
              {t("landing.cta.title1")}{" "}
              <span className="text-lime-400">{t("landing.cta.title2")}</span>
            </h2>
            <p className="relative mx-auto mt-4 max-w-md text-white/85">
              {t("landing.cta.body")}
            </p>
            <Link
              to="/signup"
              className="relative mt-8 inline-flex bg-lime-400 text-navy shadow-lime hover:bg-lime-300 btn px-7 text-base"
            >
              {t("landing.cta.button")}
            </Link>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function HeroCard() {
  const activity = demoActivity();
  const next = demoNextActivity();
  return (
    <div className="relative mx-auto w-full max-w-[280px] py-2">
      {/* soft device shadow */}
      <div className="absolute inset-x-6 bottom-0 top-10 rounded-[2.4rem] bg-navy/10 blur-2xl" />

      <div className="relative aspect-[3/4.05] w-full">
        {/* the next card waiting underneath — revealed when the top one is swiped away */}
        <div className="absolute inset-0 translate-y-3 rotate-[5deg]">
          <SwipeCard activity={next} interactive={false} />
        </div>
        <div className="absolute inset-0 -rotate-2">
          {/* the product's own core moment on a loop: a card gets swiped
              right, then the group matches. Motion-reduced users get the
              still composition. */}
          <div className="hero-swipe absolute inset-0">
            <SwipeCard activity={activity} interactive={false} />
            <span className="hero-yes pointer-events-none absolute left-4 top-6 z-20 rounded-xl border-[3px] border-brand-500 bg-white/80 px-3 py-1 text-2xl font-extrabold uppercase tracking-wider text-brand-500 backdrop-blur">
              YES
            </span>
          </div>
        </div>
      </div>

      <span className="hero-match absolute right-0 -top-2 z-10 inline-flex items-center gap-1.5 rounded-2xl bg-lime-400 px-3 py-1.5 text-sm font-extrabold text-navy shadow-lime">
        <IconCheck size={16} /> Everyone's in
      </span>

      <style>{`
        .hero-swipe { transform-origin: 50% 100%; animation: heroSwipe 8s cubic-bezier(0.16, 1, 0.3, 1) infinite; will-change: transform, opacity; }
        .hero-yes { opacity: 0; animation: heroYes 8s cubic-bezier(0.16, 1, 0.3, 1) infinite; }
        .hero-match { transform: rotate(6deg); animation: heroMatch 8s cubic-bezier(0.16, 1, 0.3, 1) infinite; }
        @keyframes heroSwipe {
          0%, 36% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 1; }
          43% { transform: translate3d(34px, -6px, 0) rotate(3deg); opacity: 1; }
          52% { transform: translate3d(155%, -34px, 0) rotate(17deg); opacity: 1; }
          53% { transform: translate3d(155%, -34px, 0) rotate(17deg); opacity: 0; }
          54%, 68% { transform: translate3d(0, 14px, 0) scale(0.97); opacity: 0; }
          80%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 1; }
        }
        @keyframes heroYes {
          0%, 38% { opacity: 0; transform: rotate(-13deg) scale(0.8); }
          45%, 51% { opacity: 1; transform: rotate(-13deg) scale(1); }
          53%, 100% { opacity: 0; transform: rotate(-13deg) scale(1); }
        }
        @keyframes heroMatch {
          0%, 36% { opacity: 1; transform: rotate(6deg) scale(1); }
          40%, 57% { opacity: 0; transform: rotate(6deg) scale(0.6); }
          62% { opacity: 1; transform: rotate(6deg) scale(1.08); }
          67%, 100% { opacity: 1; transform: rotate(6deg) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-swipe, .hero-yes, .hero-match { animation: none; }
        }
      `}</style>
    </div>
  );
}

function CrewStrip() {
  const { t } = useLang();
  const [lit, setLit] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      io.disconnect();
      if (reduce) {
        setLit(CREW.length);
        return;
      }
      CREW.forEach((_, i) =>
        window.setTimeout(() => setLit(i + 1), 260 + i * 260),
      );
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="mt-12 flex items-center justify-center gap-3">
      {CREW.map((m, i) => {
        const on = i < lit;
        return (
          <div key={m.initials} className="relative">
            <span
              className={`grid h-12 w-12 place-items-center rounded-full text-sm font-bold text-white ring-2 transition-all duration-300 ${m.tone} ${
                on ? "ring-lime-400 scale-100 opacity-100" : "ring-white/15 scale-95 opacity-40"
              }`}
            >
              {m.initials}
            </span>
            <span
              className={`absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-lime-400 text-navy ring-2 ring-navy transition-all duration-300 ${
                on ? "scale-100 opacity-100" : "scale-0 opacity-0"
              }`}
            >
              <IconCheck size={12} />
            </span>
          </div>
        );
      })}
      <span
        className={`ml-2 text-lg font-extrabold transition-opacity duration-500 ${
          lit >= CREW.length ? "text-lime-400 opacity-100" : "opacity-0"
        }`}
      >
        {t("landing.mechanism.matchLabel")}
      </span>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-paper-line bg-paper-card">
      <button
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-bold"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {q}
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-paper-soft text-navy-400 transition-transform"
          style={{ transform: open ? "rotate(45deg)" : "none" }}
        >
          <span className="text-lg leading-none">+</span>
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-4 text-sm leading-relaxed text-navy-500">{a}</p>
        </div>
      </div>
    </div>
  );
}
