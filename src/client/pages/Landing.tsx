import { useState } from "react";
import { Link } from "react-router-dom";
import { LogoMark, Wordmark } from "../components/Logo";
import { LinkButton } from "../components/ui";
import { ACTIVITY_CATEGORIES } from "@shared/constants";

const STEPS = [
  { n: 1, t: "Start a group", d: "Weekend crew, family, teammates — one group, one shared question: what are we doing?" },
  { n: 2, t: "Set the vibe", d: "Pick categories, area, budget and — if you know it — a date. Or leave the date open." },
  { n: 3, t: "Everyone swipes", d: "Each person swipes activities on their own phone. No group-chat back-and-forth." },
  { n: 4, t: "It matches when everyone's in", d: "An activity only matches when every active member liked it. One pass and it's out." },
  { n: 5, t: "Lock the plan", d: "If the date's open, VIBIN runs a quick vote on when. Then you get the full plan and a booking link." },
];

const GROUPS = [
  { emoji: "🍻", name: "Weekend crew" },
  { emoji: "👨‍👩‍👧", name: "Family day" },
  { emoji: "❤️", name: "Date night" },
  { emoji: "✈️", name: "City trip" },
  { emoji: "🧑‍💻", name: "Team outing" },
  { emoji: "🎂", name: "Birthday plan" },
];

const FEATURES = [
  { icon: "🤝", t: "Unanimous by design", d: "No majority rules. If one person passes, it's not a match — nobody gets dragged along." },
  { icon: "🙈", t: "Votes stay private", d: "VIBIN shows the group result, never who said no. So everyone swipes honestly." },
  { icon: "📅", t: "Then it finds a time", d: "Second round lands on a slot that genuinely works for everyone, not just most." },
  { icon: "⚡", t: "Built for the moment", d: "“Tonight”, “this weekend” or “no idea yet” — VIBIN handles all three." },
  { icon: "💬", t: "One group chat", d: "Plans, matches and messages in one place. The boring coordination disappears." },
  { icon: "🎟️", t: "Real venues", d: "A curated Belgian catalogue with real providers and booking links — no invented places." },
];

const FAQ = [
  { q: "Is VIBIN a dating app?", a: "No. VIBIN is for groups of friends, family or colleagues deciding what to do together. It matches activities and dates — never people." },
  { q: "What if we can't agree on anything?", a: "You keep swiping. VIBIN keeps the deck going and shows collective progress. You can always widen the filters — more categories, bigger radius, higher budget." },
  { q: "Do we need to know the date up front?", a: "No. Choose “We don't know yet” and VIBIN starts a second round to find a time once you've matched an activity." },
  { q: "Can one person block everything?", a: "A match needs everyone active. If someone is genuinely flexible, the group creator can mark them inactive so they don't hold things up — a deliberate choice, never automatic." },
  { q: "Is the activity availability live?", a: "No. VIBIN shows catalogue information. Prices and openings change — always confirm with the provider before you book. Each activity carries the date it was last checked." },
  { q: "Where does VIBIN work?", a: "The first catalogue focuses on Belgium — Antwerp, Brussels, Ghent, Leuven, Bruges and around. It's built to expand to more providers and countries." },
];

export function Landing() {
  return (
    <div className="min-h-full bg-paper text-navy">
      <div className="bg-vibin-hero">
        {/* nav */}
        <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <Wordmark />
          <nav className="flex items-center gap-2 text-sm font-semibold">
            <Link to="/login" className="btn-ghost px-4 py-2">Log in</Link>
            <Link to="/signup" className="btn-primary px-4 py-2">Get started</Link>
          </nav>
        </header>

        {/* hero */}
        <section className="mx-auto grid max-w-5xl items-center gap-10 px-5 pb-16 pt-6 md:grid-cols-2 md:pb-24 md:pt-10">
          <div className="animate-slide-up">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-card">
              <LogoMark className="h-4 w-4" /> Swipe together. Agree faster.
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.03] tracking-tight md:text-6xl">
              Find your vibe.
              <br />
              <span className="text-brand-500">Make a plan.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-navy-500">
              VIBIN helps groups decide what to do together. Everyone swipes on
              activities — it only matches when the whole group's in. Then you
              find a time and lock the plan.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <LinkButton to="/signup">Create a group</LinkButton>
              <LinkButton to="/login" variant="outline">
                Join a group
              </LinkButton>
            </div>
            <p className="mt-3 text-xs text-navy-400">
              Free to use · No card needed · Built in the EU, GDPR-friendly
            </p>
          </div>

          <PhoneDemo />
        </section>
      </div>

      {/* how it works */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="text-2xl font-extrabold md:text-3xl">How it works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-5">
          {STEPS.map((s) => (
            <li key={s.n} className="card p-5">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 font-extrabold text-white">
                {s.n}
              </div>
              <h3 className="mt-3 text-base font-bold">{s.t}</h3>
              <p className="mt-1 text-sm text-navy-400">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* why VIBIN */}
      <section className="bg-navy px-5 py-20 text-white">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-extrabold md:text-3xl">
            Why <span className="text-lime-400">VIBIN</span>
          </h2>
          <p className="mt-3 max-w-lg text-white/70">
            Group plans die in the chat. VIBIN turns “idk, what do you want to
            do?” into one clear, fair decision everyone actually agreed to.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.t}
                className="rounded-3xl bg-white/[0.06] p-6 ring-1 ring-white/10 transition hover:bg-white/[0.1]"
              >
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-3 font-bold">{f.t}</h3>
                <p className="mt-1.5 text-sm text-white/70">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* group examples */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="text-2xl font-extrabold md:text-3xl">Made for every crew</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          {GROUPS.map((g) => (
            <span key={g.name} className="chip text-base">
              <span className="text-xl">{g.emoji}</span> {g.name}
            </span>
          ))}
        </div>
      </section>

      {/* categories */}
      <section className="mx-auto max-w-5xl px-5 pb-8">
        <h2 className="text-2xl font-extrabold md:text-3xl">Every kind of plan</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {ACTIVITY_CATEGORIES.map((c) => (
            <div
              key={c.id}
              className="card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-pop"
            >
              <span className="text-2xl">{c.icon}</span>
              <span className="font-semibold">{c.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-navy-400">
          Or choose <strong className="text-navy">All activities</strong> and let
          the whole catalogue in.
        </p>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-16">
        <h2 className="text-2xl font-extrabold md:text-3xl">Good to know</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((f) => (
            <Faq key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <div className="card overflow-hidden bg-vibin-match p-10 text-center text-white">
          <h2 className="text-3xl font-extrabold">
            Stop planning. Start <span className="text-lime-400">doing</span>.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-white/85">
            Spin up a group in half a minute, share the invite link, and your
            first match is a few swipes away.
          </p>
          <div className="mt-7 flex justify-center">
            <Link to="/signup" className="btn bg-lime-400 text-navy shadow-lime hover:bg-lime-300">
              Create a group
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-paper-line px-5 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-sm text-navy-400 md:flex-row">
          <Wordmark />
          <div className="flex gap-5">
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

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-4 p-4 text-left font-semibold"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {q}
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-paper-soft text-navy-400 transition-transform"
          style={{ transform: open ? "rotate(45deg)" : "none" }}
        >
          +
        </span>
      </button>
      {open && <p className="px-4 pb-4 text-sm leading-relaxed text-navy-400">{a}</p>}
    </div>
  );
}

function PhoneDemo() {
  return (
    <div className="relative mx-auto w-full max-w-[300px] animate-float-up">
      <div className="overflow-hidden rounded-[2.5rem] border-[10px] border-navy bg-navy shadow-card">
        <div className="bg-paper-soft p-4">
          <div className="mb-3 flex items-center justify-between text-xs font-bold text-navy-400">
            <span>Weekend crew</span>
            <span className="rounded-full bg-white px-2 py-0.5">3 / 4 in</span>
          </div>
          <div className="relative aspect-[3/4] w-full">
            <div className="card absolute inset-0 rotate-3 bg-brand-100" />
            <div className="card absolute inset-0 -rotate-2 overflow-hidden">
              <div className="grid h-3/5 place-items-center bg-vibin-blue text-6xl">
                🎳
              </div>
              <div className="p-3">
                <p className="text-lg font-extrabold">Bowling &amp; Hyperbowling</p>
                <p className="text-xs text-navy-400">📍 Antwerp · From €20 / person</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-center gap-6">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-xl text-navy shadow-card">
              ✕
            </span>
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-500 text-xl text-white shadow-pop">
              ♥
            </span>
          </div>
        </div>
      </div>
      <div className="absolute -right-3 -top-3 rotate-6 rounded-2xl bg-lime-400 px-3 py-1.5 text-sm font-extrabold text-navy shadow-lime">
        Everyone's in! ✓
      </div>
    </div>
  );
}
