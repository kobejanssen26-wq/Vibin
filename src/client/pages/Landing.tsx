import { useState } from "react";
import { Link } from "react-router-dom";
import { LogoMark, Wordmark } from "../components/Logo";
import { LinkButton } from "../components/ui";
import { ACTIVITY_CATEGORIES } from "@shared/constants";

const STEPS = [
  { n: 1, t: "Create a group", d: "Weekend crew, family, team — one Mingo group, one shared goal." },
  { n: 2, t: "Everyone swipes", d: "Each person swipes activities on their own phone. No pressure, no group chat chaos." },
  { n: 3, t: "Find a match", d: "An activity only matches when every single person likes it." },
  { n: 4, t: "Make the plan", d: "Know the date already? Done. If not, Mingo runs a quick vote on when." },
  { n: 5, t: "Go do it", d: "Full plan, calendar invite, and the booking link where there is one." },
];

const GROUPS = [
  { emoji: "🍻", name: "Weekend with the boys" },
  { emoji: "👨‍👩‍👧", name: "Family" },
  { emoji: "❤️", name: "Date night" },
  { emoji: "✈️", name: "Holiday" },
  { emoji: "🧑‍💻", name: "Team outing" },
];

const FEATURES = [
  { icon: "🤝", t: "Unanimous by design", d: "No majority-rules. If one person is out, it is not a match — so nobody gets dragged along." },
  { icon: "🙈", t: "Private votes", d: "Mingo shows the group result, never who said no. Swipe honestly." },
  { icon: "📅", t: "Date matching", d: "Second round finds a time that genuinely works for everyone, not just most." },
  { icon: "⚡", t: "Made for the moment", d: "‘Tonight’, ‘this weekend’, or ‘no idea yet’ — Mingo handles all of them." },
  { icon: "💬", t: "One group chat", d: "Plans, matches and messages in one place, with the boring coordination removed." },
  { icon: "🎟️", t: "Straight to booking", d: "Where a provider has a booking or ticket link, it is right there in the plan." },
];

const FAQ = [
  { q: "Is Mingo a dating app?", a: "No. Mingo is for groups of friends, family or colleagues deciding what to do together. There is no matching of people — only of activities and dates." },
  { q: "What if we can’t agree on anything?", a: "You keep swiping. Mingo keeps the deck going and shows collective progress. You can always widen the filters — more categories, bigger radius, higher budget." },
  { q: "Do we need to know the date up front?", a: "No. Pick ‘We don’t know yet’ and Mingo starts a second round to find a date once you have matched an activity." },
  { q: "Can one person block everything?", a: "A match needs everyone. If someone is genuinely flexible, the group creator can mark them inactive so they don’t hold up the match — their call, not automatic." },
  { q: "Is the activity availability real-time?", a: "No. Mingo shows activity information from a catalogue. Always check live availability and price with the provider before you book." },
  { q: "Where is Mingo available?", a: "The first activity catalogue covers the Antwerp / Kempen region. The platform is built to add more providers and areas." },
];

export function Landing() {
  return (
    <div className="min-h-full bg-paper text-ink">
      {/* nav */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Wordmark />
        <nav className="flex items-center gap-2 text-sm font-semibold">
          <Link to="/login" className="btn-ghost px-4 py-2">Log in</Link>
          <Link to="/signup" className="btn-primary px-4 py-2">Get started</Link>
        </nav>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-5xl items-center gap-10 px-5 py-10 md:grid-cols-2 md:py-16">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-semibold shadow-card">
            <LogoMark className="h-4 w-4" /> Swipe · Match · Do
          </p>
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
            Find something{" "}
            <span className="bg-mingo-gradient bg-clip-text text-transparent">
              everyone
            </span>{" "}
            actually wants to do.
          </h1>
          <p className="mt-4 max-w-md text-lg text-ink-muted">
            Mingo is the group decision engine. Everyone swipes on activities —
            an activity only matches when the whole group likes it. Then Mingo
            locks in the date.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton to="/signup">Create a group</LinkButton>
            <LinkButton to="/login" variant="ghost">
              Join a group
            </LinkButton>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Free to use · No credit card · GDPR-friendly, built in the EU
          </p>
        </div>

        <PhoneDemo />
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="text-2xl font-extrabold md:text-3xl">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-5">
          {STEPS.map((s) => (
            <li key={s.n} className="card p-4">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-mingo-gradient font-bold text-white">
                {s.n}
              </div>
              <h3 className="mt-3 font-bold">{s.t}</h3>
              <p className="mt-1 text-sm text-ink-muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* why mingo */}
      <section className="bg-ink px-5 py-16 text-white">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-extrabold md:text-3xl">Why Mingo</h2>
          <p className="mt-2 max-w-lg text-white/70">
            Group plans die in the chat. Mingo replaces the endless “idk, what do
            you want to do?” with one clear, fair decision.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.t} className="rounded-3xl bg-white/5 p-5">
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-2 font-bold">{f.t}</h3>
                <p className="mt-1 text-sm text-white/70">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* group examples */}
      <section className="mx-auto max-w-5xl px-5 py-14">
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
      <section className="mx-auto max-w-5xl px-5 py-8">
        <h2 className="text-2xl font-extrabold md:text-3xl">Activity categories</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {ACTIVITY_CATEGORIES.map((c) => (
            <div key={c.id} className="card flex items-center gap-3 p-4">
              <span className="text-2xl">{c.icon}</span>
              <span className="font-semibold">{c.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          Or pick <strong>All activities</strong> and let the whole catalogue in.
        </p>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-14">
        <h2 className="text-2xl font-extrabold md:text-3xl">FAQ</h2>
        <div className="mt-6 space-y-3">
          {FAQ.map((f) => (
            <Faq key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <div className="card bg-mingo-gradient p-10 text-center text-white">
          <h2 className="text-3xl font-extrabold">Stop planning. Start doing.</h2>
          <p className="mx-auto mt-2 max-w-md text-white/90">
            Create a group in 30 seconds and send the invite link. Your first
            match is a few swipes away.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/signup" className="btn bg-white text-ink hover:bg-white/90">
              Create a group
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-ink/10 px-5 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-sm text-ink-muted md:flex-row">
          <Wordmark className="text-ink" />
          <div className="flex gap-5">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/login">Log in</Link>
          </div>
          <p>© {new Date().getFullYear()} Mingo</p>
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
        className="flex w-full items-center justify-between p-4 text-left font-semibold"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {q}
        <span className="text-ink-muted">{open ? "–" : "+"}</span>
      </button>
      {open && <p className="px-4 pb-4 text-sm text-ink-muted">{a}</p>}
    </div>
  );
}

function PhoneDemo() {
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div className="card overflow-hidden rounded-[2.5rem] border-[10px] border-ink p-0">
        <div className="bg-paper-soft p-4">
          <div className="mb-3 flex items-center justify-between text-xs font-bold text-ink-muted">
            <span>Weekend with the boys</span>
            <span>3 / 4 voted</span>
          </div>
          <div className="relative aspect-[3/4] w-full">
            <div className="card absolute inset-0 rotate-3 bg-gradient-to-br from-grape-400 to-coral-400" />
            <div className="card absolute inset-0 -rotate-2 overflow-hidden">
              <div className="grid h-3/5 place-items-center bg-gradient-to-br from-coral-400 to-tangerine-500 text-6xl">
                🏓
              </div>
              <div className="p-3">
                <p className="text-lg font-extrabold">Padel doubles</p>
                <p className="text-xs text-ink-muted">📍 Hoogstraten · 💰 €15 pp</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-center gap-6">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-xl shadow-card">
              ❌
            </span>
            <span className="grid h-12 w-12 place-items-center rounded-full bg-mingo-gradient text-xl text-white shadow-pop">
              ❤️
            </span>
          </div>
        </div>
      </div>
      <div className="absolute -right-3 -top-3 rotate-6 rounded-2xl bg-ink px-3 py-1.5 text-sm font-bold text-white shadow-card">
        It’s a match! 🔥
      </div>
    </div>
  );
}
