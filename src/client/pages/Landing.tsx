import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LogoMark, Wordmark } from "../components/Logo";
import { LinkButton } from "../components/ui";
import { Reveal } from "../components/Reveal";
import { SwipeCard } from "../components/SwipeCard";
import { IconCheck } from "../components/icons";
import { demoActivity, demoNextActivity } from "../lib/demo";
import { ACTIVITY_CATEGORIES } from "@shared/constants";

const CREW = [
  { initials: "KJ", tone: "bg-brand-500" },
  { initials: "LP", tone: "bg-brand-600" },
  { initials: "SD", tone: "bg-navy-700" },
  { initials: "MV", tone: "bg-brand-400" },
  { initials: "EW", tone: "bg-navy-800" },
];

const STEPS = [
  {
    k: "01",
    t: "Set the vibe",
    d: "Categories, area, budget, and a date if you have one. Two taps if you don't care.",
  },
  {
    k: "02",
    t: "Everyone swipes",
    d: "Each person swipes on their own phone. No group chat, no one dominating the plan.",
  },
  {
    k: "03",
    t: "It becomes a plan",
    d: "A match needs everyone. Then VIBIN finds a time that works and hands you the booking link.",
  },
];

const WHY = [
  {
    t: "Unanimous by design",
    d: "Majority rules is how someone always ends up bailing. One pass and it's not a match, so the plan is one everyone actually chose.",
  },
  {
    t: "Nobody sees who passed",
    d: "VIBIN shows the group result, never the individual votes. So people swipe honestly instead of politely.",
  },
  {
    t: "Real places, real prices",
    d: "A curated Belgian catalogue with real providers, honest pricing and booking links. Nothing invented to fill a card.",
  },
];

const FAQ = [
  {
    q: "Is this a dating app?",
    a: "No. VIBIN matches activities and dates for a group you already have. It never matches people.",
  },
  {
    q: "Do we need to pick a date first?",
    a: "No. Choose “we don't know yet” and VIBIN runs a quick second round to find a time once you've matched an activity.",
  },
  {
    q: "What if we can't agree on anything?",
    a: "You keep swiping, and you can widen the filters any time: more categories, bigger radius, higher budget. VIBIN never forces a match.",
  },
  {
    q: "Can one person block the whole group?",
    a: "A match needs every active member. If someone is genuinely flexible, the creator can mark them inactive so they don't hold things up. It's a deliberate choice, never automatic.",
  },
  {
    q: "Where does it work?",
    a: "The first catalogue covers Belgium: Antwerp, Brussels, Ghent, Leuven, Bruges and around. It's built to add more places and providers.",
  },
];

export function Landing() {
  return (
    <div className="min-h-full overflow-x-clip bg-paper text-navy">
      {/* ---------- nav ---------- */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Wordmark />
        <nav className="flex items-center gap-2 text-sm font-semibold">
          <Link to="/login" className="rounded-xl px-3 py-2 text-navy-500 hover:text-navy">
            Log in
          </Link>
          <Link to="/signup" className="btn-primary px-4 py-2">
            Get started
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
              <span className="inline-flex items-center gap-2 rounded-full border border-navy/10 bg-white px-3 py-1.5 text-sm font-semibold shadow-sm">
                <LogoMark className="h-4 w-4" />
                Swipe together. Agree in minutes.
              </span>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-6 text-5xl font-extrabold leading-[0.95] tracking-[-0.035em] [text-wrap:balance] sm:text-[3.4rem] md:text-[3.6rem] lg:text-[4.4rem]">
                <span className="block">Find your vibe.</span>
                <span className="block text-brand-500">Make a plan.</span>
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mt-5 max-w-md text-[17px] leading-relaxed text-navy-500">
                Your group swipes on real activities. It only matches when everyone's
                in. Then VIBIN locks the time and the booking.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <LinkButton to="/signup" className="px-6 text-base">
                  Create a group
                </LinkButton>
                <LinkButton to="/login" variant="outline" className="px-6 text-base">
                  Join a group
                </LinkButton>
              </div>

              <p className="mt-4 text-xs font-medium text-navy-400">
                Free to use. No card. Built in the EU.
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
              It doesn't count until{" "}
              <span className="text-lime-400">everyone's in.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-white/70">
              No majority vote. No loudest voice. An activity matches only when
              every person in the group liked it, so nobody gets talked into it.
            </p>
          </Reveal>

          <CrewStrip />
        </div>
      </section>

      {/* ---------- how it works (editorial 3-beat) ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <Reveal>
          <h2 className="text-2xl font-extrabold md:text-4xl">Three steps, no chat chaos</h2>
        </Reveal>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-paper-line bg-paper-line md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.k} delay={i * 90} className="bg-paper-card p-7">
              <span className="text-sm font-black tracking-widest text-brand-300">
                {s.k}
              </span>
              <h3 className="mt-3 text-lg font-extrabold">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-500">{s.d}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ---------- category strip (horizontal scroll, not a grid) ---------- */}
      <section className="py-4">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <h2 className="text-2xl font-extrabold md:text-4xl">Plan anything</h2>
            <p className="mt-2 text-navy-500">
              Twelve categories, or one tap for the whole catalogue.
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
              <span className="mt-8 font-bold leading-tight">{c.label}</span>
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
              Why groups stick with it
            </h2>
            <p className="mt-4 text-navy-500">
              The mechanics are the point. Small choices that change how a group
              decides.
            </p>
          </Reveal>
          <div className="space-y-px overflow-hidden rounded-3xl border border-paper-line bg-paper-line">
            {WHY.map((w, i) => (
              <Reveal key={w.t} delay={i * 80} className="bg-paper-card p-7">
                <div className="flex items-start gap-4">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-500 text-white">
                    <IconCheck size={16} />
                  </span>
                  <div>
                    <h3 className="text-base font-extrabold">{w.t}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-navy-500">
                      {w.d}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="mx-auto max-w-3xl px-5 py-16">
        <Reveal>
          <h2 className="text-2xl font-extrabold md:text-4xl">Good to know</h2>
        </Reveal>
        <div className="mt-8 space-y-3">
          {FAQ.map((f, i) => (
            <Reveal key={f.q} delay={i * 50}>
              <Faq q={f.q} a={f.a} />
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
              Stop planning. Start{" "}
              <span className="text-lime-400">doing.</span>
            </h2>
            <p className="relative mx-auto mt-4 max-w-md text-white/85">
              A group takes thirty seconds. Send the link, and your first match is
              a few swipes away.
            </p>
            <Link
              to="/signup"
              className="relative mt-8 inline-flex bg-lime-400 text-navy shadow-lime hover:bg-lime-300 btn px-7 text-base"
            >
              Create a group
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="border-t border-paper-line px-5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-navy-400 md:flex-row">
          <Wordmark />
          <div className="flex gap-5">
            <Link to="/contact" className="hover:text-navy">Contact</Link>
            <Link to="/privacy" className="hover:text-navy">Privacy</Link>
            <Link to="/terms" className="hover:text-navy">Terms</Link>
            <Link to="/login" className="hover:text-navy">Log in</Link>
          </div>
          <p>© {new Date().getFullYear()} VIBIN</p>
        </div>
      </footer>
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
        Match.
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
