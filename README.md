<div align="center">

# Mingo

**Swipe. Match. Do.** — the group decision engine for deciding what to do together.

</div>

Mingo is *Tinder, but for activities with a group of friends*. Everyone in a group
swipes on activities independently. An activity becomes a **match only when every
active member likes it**. If the group doesn't know when they want to go, Mingo
runs a **second matching phase** to find a date/time everyone accepts. Once the
activity *and* the date are locked in, the group has a complete plan — with a
calendar invite and a booking link where one exists.

There is **no discovery feed**. The swipe is the product.

> **Live:** https://mingo.kobe-janssen26.workers.dev — deployed on Cloudflare
> Workers + D1 (region WEUR). Installable as a PWA (open on a phone → *Add to
> Home Screen*). Redeploy with `npm run deploy`.

---

## Contents

1. [Architecture](#architecture)
2. [Tech stack](#tech-stack)
3. [Repository layout](#repository-layout)
4. [Local development](#local-development)
5. [Environment variables & secrets](#environment-variables--secrets)
6. [Creating the Cloudflare resources](#creating-the-cloudflare-resources)
7. [Migrations & seed data](#migrations--seed-data)
8. [Deployment](#deployment)
9. [Connecting GitHub to Cloudflare (CI/CD)](#connecting-github-to-cloudflare-cicd)
10. [Testing](#testing)
11. [Database schema](#database-schema)
12. [Key business rules](#key-business-rules)
13. [Security model](#security-model)
14. [Known limitations & next steps](#known-limitations--next-steps)

---

## Architecture

```
┌──────────────────────────── Cloudflare Worker (single deploy) ─────────────────────────┐
│                                                                                       │
│   React SPA (Vite build)  ──►  Workers Static Assets  ──► served for all non-/api/*    │
│                                                                                       │
│   /api/*  ──►  Hono router                                                             │
│                 ├─ auth      (email+password, PBKDF2, KV sessions, CSRF, rate limit)   │
│                 ├─ groups    (create / configure / invite / members)                  │
│                 ├─ votes     (server-side swipe voting  ──►  match engine)             │
│                 ├─ dates     (second matching phase)                                   │
│                 ├─ plans     (confirmed plan + .ics + calendar links)                  │
│                 ├─ messages  (group chat, polled)                                      │
│                 ├─ me        (profile, notifications, GDPR export/delete)              │
│                 ├─ reports   (moderation intake)                                       │
│                 └─ admin     (stats, activities CRUD, reports)   [role: admin]         │
│                                                                                       │
│   Bindings:  D1 (DB)   ·   KV (sessions, rate-limit)   ·   R2 (MEDIA: avatars/images)  │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- **Pure match engine** (`src/worker/engine/match.ts`) — deterministic functions
  with no I/O, unit-tested exhaustively. The route layer loads rows, calls the
  engine, and persists inside `db.batch()` transactions.
- **Realtime** is polling today (`usePoll`), but every endpoint returns a discrete
  state snapshot, so it can be swapped for WebSockets / a Durable Object without
  touching callers.
- **Authorization** funnels through one guard (`requireGroupMember` /
  `requireGroupCreator`). Changing an id in a URL can never leak another group's
  data — this is covered by tests.

## Tech stack

| Concern            | Choice                                                        |
| ------------------ | ------------------------------------------------------------- |
| Frontend           | React 18 + TypeScript + Vite + React Router + Tailwind CSS   |
| API                | Hono on Cloudflare Workers (same Worker serves the SPA)      |
| Database           | Cloudflare D1 (SQLite) via Drizzle ORM + drizzle-kit         |
| Sessions / limits  | Cloudflare KV                                                |
| Media              | Cloudflare R2                                                |
| Auth               | Email + password, PBKDF2-SHA-256 (Web Crypto), KV sessions   |
| Tests              | Vitest (engine units) + a black-box HTTP integration suite   |
| CI/CD              | GitHub Actions → `wrangler deploy`                           |

No native dependencies — everything runs on the Workers runtime.

## Repository layout

```
src/
  shared/            types & constants shared by client + worker
  worker/
    index.ts         Hono app, security headers, route mounting, SPA fallback
    env.ts           typed bindings
    db/schema.ts     Drizzle schema (source of truth for migrations)
    engine/          match.ts (pure logic) + match.test.ts + deck.ts
    lib/             auth, sessions, cookies, csrf, dto mappers, dates, calendar…
    routes/          one file per resource group
  client/
    pages/           one file per screen
    components/      SwipeCard, MatchCelebration, Confetti, AppShell, ui primitives…
    lib/             api client, auth context, polling hook
migrations/          generated SQL — never hand-edit a committed file
seed/                typed sample catalogue + build-seed.ts → seed.sql
tests/integration.mjs  black-box HTTP test against a running Worker
scripts/             smoke.ps1, make-icons.mjs
.github/workflows/   ci.yml
```

## Local development

Prerequisites: **Node 20+** and a Cloudflare account (for `wrangler`, even locally).

```bash
npm install
cp .dev.vars.example .dev.vars     # local secrets for `wrangler dev`

# create + seed the LOCAL D1 database (a SQLite file under .wrangler/)
npm run db:migrate:local
npm run db:seed:build              # regenerates seed/seed.sql from seed/activities.ts
npm run db:seed:local

npm run dev                        # vite (5173) + wrangler dev (8787) together
```

Open **http://localhost:5173**. The Vite dev server proxies `/api/*` to the Worker
on `:8787`. Verification emails (sign-up, password reset) are printed to the
`wrangler dev` console in development — there is no mail provider by default.

To exercise the production bundle exactly as it deploys:

```bash
npm run build && npx wrangler dev      # serves the built SPA + API on :8787
```

## Environment variables & secrets

Runtime **bindings** (D1 / KV / R2) live in `wrangler.jsonc`, not in an env file.
Only **secrets** and deploy-time values go in `.env` / `.dev.vars` / CI secrets —
see [`.env.example`](.env.example):

| Name                   | Where                         | Purpose                                             |
| ---------------------- | ----------------------------- | -------------------------------------------------- |
| `AUTH_SECRET`          | `.dev.vars` / `wrangler secret` | Signing key for tokens. Generate a strong random. |
| `EMAIL_API_KEY`        | `.dev.vars` / `wrangler secret` | Transactional email. Blank → links logged to console. |
| `EMAIL_FROM`           | `wrangler.jsonc` var / secret  | From address for emails.                           |
| `CLOUDFLARE_ACCOUNT_ID`| GitHub Actions secret          | CI deploy.                                         |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret          | CI deploy (scoped token, see below).               |

Generate `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Never commit `.dev.vars` or `.env` (both are git-ignored).

## Creating the Cloudflare resources

```bash
npx wrangler login

# D1 — run for each environment you want (default / staging / production)
npx wrangler d1 create mingo-db
npx wrangler d1 create mingo-db-staging

# KV
npx wrangler kv namespace create KV
npx wrangler kv namespace create KV --env staging

# R2
npx wrangler r2 bucket create mingo-media
npx wrangler r2 bucket create mingo-media-staging
```

Copy each returned **id** into the matching `REPLACE_WITH_…` placeholder in
`wrangler.jsonc` (top level = your default/dev remote; `env.staging` /
`env.production` blocks for the named environments).

Then set the production secrets:

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put EMAIL_API_KEY          # optional
# repeat with --env staging / --env production as needed
```

## Migrations & seed data

Migrations are **generated from the schema** and applied with `wrangler`:

```bash
# after editing src/worker/db/schema.ts
npm run db:generate                 # writes migrations/NNNN_*.sql

npm run db:migrate:local            # local SQLite
npm run db:migrate:remote          # default remote D1
npx wrangler d1 migrations apply mingo-db --remote --env production
```

Seed data is **development only** and kept separate from migrations:

```bash
npm run db:seed:build              # seed/activities.ts  ->  seed/seed.sql
npm run db:seed:local              # or :remote for a staging demo
```

To grant yourself admin access (after signing up):

```bash
npx wrangler d1 execute mingo-db --local \
  --command "UPDATE users SET role='admin' WHERE email_normalized='you@example.com'"
```

## Deployment

```bash
npm run deploy                     # build + wrangler deploy   (default env)
npm run deploy:staging             # --env staging
npx wrangler deploy --env production
```

`wrangler deploy` uploads the Worker **and** the `dist/` static assets in one
step. Run migrations against the target D1 *before* the first deploy of a new
environment.

## Connecting GitHub to Cloudflare (CI/CD)

[`.github/workflows/ci.yml`](.github/workflows/ci.yml):

- **on every push / PR** — typecheck, lint, unit tests, production build.
- **on push to `main`** — additionally runs D1 migrations and
  `wrangler deploy --env production`.

Set up:

1. **Cloudflare API token** — dashboard → *My Profile → API Tokens → Create Token*.
   Use the *Edit Cloudflare Workers* template and add **D1 Edit** + **Workers KV
   Storage Edit** + **Workers R2 Storage Edit** permissions for your account.
2. In the GitHub repo → *Settings → Secrets and variables → Actions*, add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
3. Fill the real resource ids into `wrangler.jsonc` and commit.
4. Push to `main` — the workflow deploys.

Secrets like `AUTH_SECRET` are set once with `wrangler secret put` (or via
`cloudflare/wrangler-action` with `secrets:`), **never** committed.

## Testing

```bash
npm test                 # Vitest — 26 pure unit tests for the match engine
npm run typecheck        # tsc on the worker, client and node projects

# integration (needs a running Worker):
npx wrangler dev &        # or: npm run dev
npm run test:integration  # 18 black-box HTTP checks against :8787
```

The integration suite covers the rules unit tests can't: unanimous match across
real members (2/2 like → match, 1 nope → none), the date phase completing only on
unanimous acceptance, `no_consensus` never auto-picking an excluding date, IDOR
(a non-member gets 403), removed members losing access, and invalid invite codes.
`scripts/smoke.ps1` is a quick manual end-to-end walk of the happy path.

## Database schema

21 tables (`src/worker/db/schema.ts`). Highlights:

| Table                  | Notes                                                             |
| ---------------------- | --------------------------------------------------------------- |
| `users`, `profiles`    | auth split from profile; `role` = user \| admin                 |
| `email_tokens`         | verification / reset — only the SHA-256 hash is stored          |
| `groups`               | `status`: configuring → swiping → date_matching → planned → archived |
| `group_settings`       | categories / radius / budget / **date_mode** (`unknown` triggers phase 2) |
| `group_members`        | `status`: active \| inactive \| removed \| left — only *active* counts toward a match |
| `group_invites`        | code, max_uses, expiry, revocable                              |
| `activities`, `activity_categories`, `activity_images`, `providers` | catalogue + provider abstraction |
| `group_activity_pool`  | the materialised, ordered deck per group                        |
| `activity_votes`       | UNIQUE(group, activity, user); server-authoritative            |
| `matches`              | UNIQUE(group, activity) — the idempotency guard for concurrent votes |
| `date_options`, `date_votes` | second matching phase; UNIQUE(option, user)              |
| `plans`                | UNIQUE(match) — completes the plan exactly once                 |
| `messages`             | text + system (match / date / plan events)                      |
| `notifications`, `notification_prefs`, `reports` |                                     |

## Key business rules

- **Unanimous only.** `evaluateActivityMatch` returns `matched` only when every
  *active* member voted like/superlike. One `nope` — or one missing vote —
  means no match. Individual votes are never exposed; the group sees only the
  collective result.
- **Don't force a date that's already known.** If the group configured a concrete
  date, a match is completed immediately as a plan — no date vote.
- **Second phase prioritises 100% agreement.** `evaluateDateMatch` only auto-picks
  a slot with zero `no` votes and zero missing votes. Otherwise it reports
  `no_consensus` and the group keeps voting / adds options. It never chooses a
  time that excludes someone.
- **Server-authoritative voting.** The client never decides a match. Concurrent
  deciding votes can only create one match / one plan (UNIQUE constraints +
  `INSERT … ON CONFLICT`).

## Security model

- Passwords: PBKDF2-SHA-256, 210k iterations, per-user salt, constant-time verify,
  versioned for future rehashing.
- Sessions: opaque 32-byte id in an `HttpOnly; Secure; SameSite=Lax` cookie,
  record in KV with TTL; per-user session index for global logout on reset/delete.
- CSRF: double-submit token (readable cookie echoed in `X-Mingo-CSRF`), checked on
  every non-GET.
- Authorization: single guard per group route; **explicit IDOR test**.
- Rate limiting: KV fixed-window on auth + write endpoints (disabled in
  `development` so tests can create many accounts).
- Input validation: Zod on every body/query.
- Security headers via Hono `secureHeaders`; R2 objects served `nosniff` with a
  restricted key prefix.
- Uploads: type + size checked; stored under unguessable keys.
- GDPR: data export (JSON) and hard account deletion (FK cascade) in-app;
  minimal collection; no continuous location; Privacy Policy + Terms pages;
  private routes `Disallow`ed in `robots.txt`.

## Known limitations & next steps

**Limitations (by design, for the MVP):**

- Realtime is polling (4–15s). Fine for small groups; see below.
- Seed activities are a **sample catalogue**, not live availability. The UI says so.
- Email requires you to wire a provider in `src/worker/lib/email.ts` (Resend stub
  included); until then links are logged.
- Geographic radius filtering is done in JS over a small dataset.
- Push notifications are stored in-app only (no web-push / APNs yet).
- Admin UI is intentionally minimal (stats, activity activate/deactivate, reports).
- Legal pages are templates — have them reviewed before a public launch.
- **Password hashing** is PBKDF2 with 6 chained 100k-iteration rounds (~600k
  effective). The Workers runtime caps a single PBKDF2 call at 100k, hence the
  chaining. Consider moving hashing to a Durable Object for a stronger KDF later.
- **Photo uploads (R2)** are disabled on the live deploy because R2 isn't
  enabled on the account. The app shows initials everywhere instead. To turn it
  on: enable R2 in the Cloudflare dashboard, `wrangler r2 bucket create
  mingo-media`, add the `r2_buckets` binding to `wrangler.jsonc`, redeploy.
- The `*.workers.dev` URL works everywhere but won't rank on Google. For
  discoverability, add a custom domain (Workers → Settings → Domains) and submit
  the sitemap in Google Search Console.

**Recommended next steps:**

1. Swap polling for a **Durable Object** per group (votes, chat, presence) → true
   realtime; the endpoint contracts already fit.
2. Implement a real `ActivityProvider` (events API / booking platform) behind the
   existing provider abstraction; add an ingestion Worker cron.
3. Web-push notifications + the `notification_prefs` already modelled.
4. Move radius filtering to a spatial index or precomputed geohash buckets.
5. Group ownership transfer UI (the API path exists for account deletion).
6. Expand the integration suite into `@cloudflare/vitest-pool-workers` for
   in-process D1 so it runs without a live server in CI.
7. Rich admin: user management, provider config, analytics dashboards.

## License

Private / all rights reserved (change as appropriate before open-sourcing).
