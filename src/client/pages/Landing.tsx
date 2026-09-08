import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "../components/Logo";
import { LinkButton } from "../components/ui";
import { Reveal } from "../components/Reveal";
import { SwipeCard } from "../components/SwipeCard";
import { CategoryIcon, IconCheck } from "../components/icons";
import { demoActivity } from "../lib/demo";
import { ACTIVITY_CATEGORIES } from "@shared/constants";

const CREW = ["KJ", "LP", "SD", "MV", "EW"];

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
    <div className="min-h-full bg-paper text-navy">
      {/* nav */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Wordmark />
        <nav className="flex items-center gap-1 text-sm font-semibold">
          <Link
            to="/login"
            className="rounded-lg px-3 py-2 text-navy-500 hover:text-navy"
          >
            Log in
          </Link>
          <Link to="/signup" className="btn-primary px-4 py-2 text-sm">
            Get started
          </Link>
        </nav>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-5xl items-center gap-12 px-5 pb-16 pt-6 md:grid-cols-[1.1fr_0.9fr] md:gap-16 md:pb-24 md:pt-10">
        <div>
          <span className="inline-flex items-center gap-2 rounded-lg border border-paper-line bg-paper-card px-2.5 py-1 text-[13px] font-semibold text-navy-500">
            Swipe together. Agree in minutes.
          </span>

          <h1 className="mt-5 text-[2.75rem] font-extrabold leading-[1.02] tracking-[-0.04em] [text-wrap:balance] sm:text-5xl lg:text-[4rem]">
            Find your vibe.
            <br />
            <span className="text-brand-500">Make a plan.</span>
          </h1>

          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-navy-500">
            Your group swipes on real activities. It only matches when everyone's
            in. Then VIBIN locks the time and the booking.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <LinkButton to="/signup" className="px-5">
              Create a group
            </LinkButton>
            <LinkButton to="/login" variant="outline" className="px-5">
              Join a group
            </LinkButton>
          </div>

          <p className="mt-4 text-xs font-medium text-navy-400">
            Free to use. No card. Built in the EU.
          </p>
        </div>

        <HeroCard />
      </section>

      {/* the mechanism */}
      <section className="bg-navy px-5 py-20 text-white md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-lime-400">
              The whole idea
            </p>
            <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-extrabold leading-tight tracking-[-0.02em] md:text-[2.75rem]">
              It doesn't count until{" "}
              <span className="text-lime-400">everyone's in.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-white/60">
              No majority vote. No loudest voice. An activity matches only when
              every person in the group liked it, so nobody gets talked into it.
            </p>
          </Reveal>
          <CrewStrip />
        </div>
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-5xl px-5 py-20 md:py-28">
        <Reveal>
          <h2 className="text-2xl font-extrabold tracking-[-0.02em] md:text-[2rem]">
            Three steps, no chat chaos
          </h2>
        </Reveal>
        <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-paper-line bg-paper-line md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.k} delay={i * 70} className="bg-paper-card p-6">
              <span className="text-xs font-bold tracking-widest text-navy-300">
                {s.k}
              </span>
              <h3 className="mt-3 text-[15px] font-bold">{s.t}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-navy-500">
                {s.d}
              </p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* categories */}
      <section className="py-4">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal>
            <h2 className="text-2xl font-extrabold tracking-[-0.02em] md:text-[2rem]">
              Plan anything
            </h2>
            <p className="mt-2 text-[15px] text-navy-500">
              Twelve categories, or one tap for the whole catalogue.
            </p>
          </Reveal>
        </div>
        <div
          className="mt-6 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="list"
        >
          <div
            className="shrink-0"
            style={{ width: "max(1.25rem, calc((100vw - 64rem) / 2))" }}
          />
          {ACTIVITY_CATEGORIES.map((c) => (
            <div
              key={c.id}
              role="listitem"
              className="flex w-36 shrink-0 snap-start flex-col justify-between rounded-xl border border-paper-line bg-paper-card p-4"
            >
              <span className="text-navy-500">
                <CategoryIcon id={c.id} size={22} />
              </span>
              <span className="mt-8 text-[14px] font-semibold leading-tight">
                {c.label}
              </span>
            </div>
          ))}
          <div
            className="shrink-0"
            style={{ width: "max(1.25rem, calc((100vw - 64rem) / 2))" }}
          />
        </div>
      </section>

      {/* why */}
      <section className="mx-auto max-w-5xl px-5 py-20 md:py-28">
        <div className="grid gap-8 md:grid-cols-[0.8fr_1.2fr] md:gap-14">
          <Reveal>
            <h2 className="text-2xl font-extrabold leading-tight tracking-[-0.02em] md:text-[2rem]">
              Why groups stick with it
            </h2>
            <p className="mt-4 text-[15px] text-navy-500">
              The mechanics are the point. Small choices that change how a group
              decides.
            </p>
          </Reveal>
          <div className="overflow-hidden rounded-2xl border border-paper-line">
            {WHY.map((w, i) => (
              <Reveal
                key={w.t}
                delay={i * 60}
                className={`p-6 ${i > 0 ? "border-t border-paper-line" : ""}`}
              >
                <div className="flex items-start gap-3.5">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand-500 text-white">
                    <IconCheck size={14} />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-bold">{w.t}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-navy-500">
                      {w.d}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-2xl px-5 py-16">
        <Reveal>
          <h2 className="text-2xl font-extrabold tracking-[-0.02em] md:text-[2rem]">
            Good to know
          </h2>
        </Reveal>
        <div className="mt-8 space-y-2.5">
          {FAQ.map((f, i) => (
            <Reveal key={f.q} delay={i * 40}>
              <Faq q={f.q} a={f.a} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-5 pb-20">
        <Reveal>
          <div className="rounded-2xl bg-navy p-10 text-center text-white md:p-14">
            <h2 className="text-2xl font-extrabold tracking-[-0.02em] md:text-[2.5rem]">
              Stop planning. Start{" "}
              <span className="text-lime-400">doing.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[15px] text-white/60">
              A group takes thirty seconds. Send the link, and your first match is
              a few swipes away.
            </p>
            <Link to="/signup" className="btn-lime mt-7 inline-flex px-6">
              Create a group
            </Link>
          </div>
        </Reveal>
      </section>

      {/* footer */}
      <footer className="border-t border-paper-line px-5 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-sm text-navy-400 md:flex-row">
          <Wordmark />
          <div className="flex gap-5">
            <Link to="/privacy" className="hover:text-navy">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-navy">
              Terms
            </Link>
            <Link to="/login" className="hover:text-navy">
              Log in
            </Link>
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
  return (
    <div className="relative mx-auto w-full max-w-[264px]">
      <div className="relative aspect-[3/4.05] w-full">
        <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-2xl border border-paper-line bg-paper-card" />
        <div className="absolute inset-0">
          <SwipeCard activity={activity} interactive={false} />
        </div>
      </div>
      <span className="absolute -right-1 -top-2 z-10 inline-flex items-center gap-1.5 rounded-lg bg-lime-400 px-2.5 py-1 text-[13px] font-bold text-navy">
        <IconCheck size={14} /> Everyone's in
      </span>
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
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        if (reduce) {
          setLit(CREW.length);
          return;
        }
        CREW.forEach((_, i) =>
          window.setTimeout(() => setLit(i + 1), 200 + i * 200),
        );
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="mt-10 flex items-center justify-center gap-2.5">
      {CREW.map((ini, i) => {
        const on = i < lit;
        return (
          <div key={ini} className="relative">
            <span
              className={`grid h-11 w-11 place-items-center rounded-full bg-brand-500 text-[13px] font-bold text-white transition-opacity duration-300 ${
                on ? "opacity-100" : "opacity-30"
              }`}
            >
              {ini}
            </span>
            <span
              className={`absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-lime-400 text-navy ring-2 ring-navy transition-transform duration-300 ${
                on ? "scale-100" : "scale-0"
              }`}
            >
              <IconCheck size={10} />
            </span>
          </div>
        );
      })}
      <span
        className={`ml-2 text-base font-extrabold transition-opacity duration-500 ${
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
    <div className="overflow-hidden rounded-xl border border-paper-line bg-paper-card">
      <button
        className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left text-[15px] font-semibold"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {q}
        <span
          className="grid h-5 w-5 shrink-0 place-items-center text-navy-400 transition-transform"
          style={{ transform: open ? "rotate(45deg)" : "none" }}
        >
          <span className="text-lg leading-none">+</span>
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p className="px-4 pb-4 text-[13px] leading-relaxed text-navy-500">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}
