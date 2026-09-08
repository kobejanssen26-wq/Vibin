<div align="center">

# VIBIN

**Find your vibe. Make a plan.**

A social activity-planning app: groups swipe on activities, and it only matches
when *everyone* agrees. If the group doesn't know when yet, VIBIN runs a second
round to find a time. Then it produces the complete plan — with a real booking
link where one exists.

</div>

> **Production domain:** https://vibin.be (see [Domain configuration](#domain-configuration))
> **Currently deployed at:** the `*.workers.dev` URL printed by `wrangler deploy`
> (until `vibin.be` DNS is pointed at the Worker).

---

## Contents

1. [What VIBIN is](#what-vibin-is)
2. [Tech stack](#tech-stack)
3. [Repository layout](#repository-layout)
4. [Local development](#local-development)
5. [Working from multiple computers](#working-from-multiple-computers)
6. [Environment variables](#environment-variables)
7. [Cloudflare resources](#cloudflare-resources)
8. [Database & migrations](#database--migrations)
9. [Activity data (real, verified)](#activity-data-real-verified)
10. [Deployment](#deployment)
11. [Domain configuration](#domain-configuration)
12. [GitHub & CI](#github--ci)
13. [Testing](#testing)
14. [Design system](#design-system)
15. [Owner Command Center](#owner-command-center-admin)
16. [Security & GDPR](#security--gdpr)
17. [Known limitations & next steps](#known-limitations--next-steps)

## What VIBIN is

The core loop, and the whole product:

```
GROUP → set the vibe (category / area / budget / date) → everyone SWIPES
      → UNANIMOUS MATCH (every active member liked it)
      → DATE MATCH (only if the date was left open)
      → PLAN (activity + time + location + price + booking link) → GO
```

There is **no discovery/explore feed**. The swipe is the product.

## Tech stack

| Concern            | Choice                                                        |
| ------------------ | ----------------------------------------------------------- |
| Frontend           | React 18 + TypeScript + Vite + React Router + Tailwind CSS |
| API                | Hono on a single Cloudflare Worker (also serves the SPA)   |
| Database           | Cloudflare D1 (SQLite) via Drizzle ORM + drizzle-kit       |
| Sessions / limits  | Cloudflare KV                                              |
| Media (optional)   | Cloudflare R2 — off by default, app degrades to initials   |
| Auth               | Email + password, PBKDF2-SHA-256 (chained, Web Crypto)     |
| Tests              | Vitest (pure units) + a black-box HTTP integration suite   |
| CI/CD              | GitHub Actions → `wrangler deploy`                         |

No native dependencies — everything runs on the Workers runtime.

## Repository layout

```
src/
  shared/            types + constants shared by client and worker
  worker/
    index.ts         Hono app, security headers, routes, SPA fallback
    db/schema.ts      Drizzle schema — source of truth for migrations
    engine/           match.ts (pure logic) + deck.ts + tests
    lib/              auth, sessions, cookies, dto, dates, calendar…
    routes/           one file per resource group
  client/
    pages/            one file per screen
    components/       SwipeCard, MatchCelebration, Confetti, AppShell, ui…
    lib/              api client, auth context, polling hook
migrations/          generated SQL — never hand-edit a committed file
seed/                seed/activities.ts (real Belgian venues) + build-seed.ts
tests/integration.mjs black-box HTTP test against a running Worker
scripts/             make-icons.mjs, smoke.ps1, prod-check.ps1
.github/workflows/   ci.yml
```

## Local development

Prerequisites: **Node 20+**, a Cloudflare account (for `wrangler`, even locally).

```bash
git clone <your-repo-url> vibin && cd vibin
npm install
cp .dev.vars.example .dev.vars       # local-only secrets/vars (git-ignored)

# create + seed the LOCAL D1 database (a SQLite file under .wrangler/)
npm run db:migrate:local
npm run db:seed:local                # builds seed.sql then loads it

npm run dev                          # Vite (5173) + wrangler dev (8787)
```

Open **http://localhost:5173**. Verification / reset emails are printed to the
`wrangler dev` console in development (no mail provider needed).

To grant yourself admin after signing up:

```bash
npx wrangler d1 execute vibin-db --local \
  --command "UPDATE users SET role='admin' WHERE email_normalized='you@example.com'"
```

## Working from multiple computers

The repository is the single source of truth. On any machine:

```bash
git pull
npm install
cp .dev.vars.example .dev.vars       # if you don't have it yet
npm run db:migrate:local && npm run db:seed:local   # local DB is not in git
npm run dev
```

Nothing the app needs lives only on one machine:
- **Schema + migrations** are in `migrations/` (committed).
- **Seed data** is generated from `seed/activities.ts` (committed) by
  `npm run db:seed:build` — `seed/seed.sql` itself is git-ignored.
- The **local D1 file** under `.wrangler/` is disposable; recreate it with the
  two commands above.
- **Secrets** are never committed. Copy `.dev.vars.example` → `.dev.vars`
  locally; set production secrets with `wrangler secret put`.

Then just `git add . && git commit && git push`, and `git pull` on the other
machine.

## Environment variables

Runtime **bindings** (D1 / KV / R2) live in `wrangler.jsonc`. Only **secrets**
and deploy values go in env files — see [`.env.example`](.env.example):

| Name                   | Where                          | Purpose                                             |
| ---------------------- | ------------------------------ | -------------------------------------------------- |
| `APP_ENV`              | `.dev.vars` / `wrangler.jsonc` | `development` locally, `production` deployed. Rate-limiting is disabled when `development`. |
| `APP_URL`              | `.dev.vars` / `wrangler.jsonc` | Canonical origin for invite links, emails, `.ics`. |
| `AUTH_SECRET`          | `.dev.vars` / `wrangler secret` | Reserved for signed tokens (not yet used). Set a strong random in prod. |
| `EMAIL_API_KEY` / `EMAIL_FROM` | secret / var            | Transactional email. Blank → links logged to console. |
| `ENCRYPTION_KEY`       | `.dev.vars` / `wrangler secret` | **Owner Command Center.** AES-256-GCM key (base64 of 32 bytes) for the credential vault + TOTP secrets. Required before owner setup. Never commit. |
| `OWNER_RECOVERY_SECRET`| `.dev.vars` / `wrangler secret` | **Owner Command Center.** Break-glass recovery string. Presenting it triggers a one-shot owner password-reset email + MFA clear. Leave blank to disable recovery. |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | GitHub secrets | CI deploy. |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # AUTH_SECRET / OWNER_RECOVERY_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"       # ENCRYPTION_KEY
```

## Cloudflare resources

```bash
npx wrangler login
npx wrangler d1 create vibin-db
npx wrangler kv namespace create vibin-kv
# paste the returned ids into wrangler.jsonc (d1_databases[].database_id, kv_namespaces[].id)

npx wrangler secret put AUTH_SECRET
npx wrangler d1 migrations apply vibin-db --remote
npm run db:seed:remote
npm run deploy
```

R2 (photo uploads) is optional and off by default. To enable: turn on R2 in the
dashboard, `wrangler r2 bucket create vibin-media`, add the `r2_buckets` binding
to `wrangler.jsonc`, redeploy. Until then the app shows initials everywhere.

## Database & migrations

Migrations are generated from the schema and applied with `wrangler`:

```bash
# after editing src/worker/db/schema.ts
npm run db:generate                 # writes migrations/NNNN_*.sql — commit it
npm run db:migrate:local            # local
npm run db:migrate:remote           # remote D1
```

Never edit a migration that has been committed/applied — add a new one.

## Activity data (real, verified)

Every activity in `seed/activities.ts` is a **real, publicly-listed Belgian
venue** (Antwerp, Brussels, Ghent, Leuven, Bruges…). For each one the provider
name, official website, city, address and booking URL were taken from public
sources on the date in `SEED_VERIFIED_ON`.

- Prices are **indicative** and typed honestly — `per_person`, `per_group`,
  `from_per_person`, `free` or `varies`. A group price is never shown as a
  per-person price.
- Every seeded activity ships as **`status: "needs_review"`** with
  `last_verified_at` = the seed date. **Nothing is marked `verified`
  automatically.**
- Seeded activities have **no photo** yet — the card falls back to a branded
  category treatment. Provider-approved photos are the launch upgrade path and
  can be added per activity in the admin.

**Before a public launch:** an admin should open each `needs_review` activity,
re-check it against the provider, and click **Verify** (which stamps
`last_verified_at`). The deck already excludes `outdated` and `inactive`
activities. See the admin at `/admin` (requires the `admin` role).

The `providers` table + `source` / `sourceUrl` fields are the abstraction point
for adding real activity-provider integrations later.

## Deployment

```bash
npm run deploy            # build + wrangler deploy
```

`wrangler deploy` uploads the Worker **and** the `dist/` static assets in one
step. Run `wrangler d1 migrations apply vibin-db --remote` before the first
deploy after a schema change.

## Domain configuration

The app is configured for **`https://vibin.be`** (canonical URL, Open Graph,
`APP_URL`, sitemap, robots, PWA, email links).

DNS/hosting is **not** wired up automatically. To make `vibin.be` live:

1. Add `vibin.be` as a zone in the Cloudflare account that owns the Worker
   (or move the existing registration into it).
2. Cloudflare dashboard → Workers & Pages → **vibin** → Settings → **Domains &
   Routes** → *Add* → Custom Domain → `vibin.be` (and `www.vibin.be`).
   Cloudflare provisions the certificate and routes automatically.
3. No code change needed — `APP_URL` already points at `https://vibin.be`.

Until then the deployed Worker is reachable at its `*.workers.dev` URL, and the
app works there; only outbound links/emails assume the final domain.

## GitHub & CI

- `.github/workflows/ci.yml` runs typecheck + lint + unit tests + build + the
  integration suite on every push / PR.
- On push to `main` it additionally runs D1 migrations and `wrangler deploy`,
  using repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- Create the API token from the Cloudflare dashboard (*Edit Cloudflare Workers*
  template + **D1 Edit** + **Workers KV Storage Edit**).
- `.gitignore` excludes `dist/`, `.wrangler/`, `.dev.vars`, `.env*`,
  `seed/seed.sql`, `node_modules/`. Secrets are never committed.

## Testing

```bash
npm test                 # Vitest — match engine + password hashing (31 tests)
npm run typecheck        # tsc on worker, client and node projects

# integration (needs a running Worker):
npm run dev &
BASE=http://127.0.0.1:8787 node tests/integration.mjs   # 18 black-box checks
```

The integration suite covers: unanimous match (2/2 like → match, 1 pass → none),
the date phase completing only on unanimous acceptance, `no_consensus` never
auto-picking an excluding time, **IDOR** (a non-member gets 403), removed members
losing access, and invalid invite codes.

## Design system

VIBIN tokens live in `tailwind.config.ts` (mirrored as CSS variables in
`src/client/index.css`):

| Token       | Hex       | Role                                        |
| ----------- | --------- | ------------------------------------------- |
| VIBIN Blue  | `#3155FF` | primary buttons, links, active states      |
| VIBIN Lime  | `#B8F23D` | accent only — matches, success, badges      |
| Deep Navy   | `#101426` | text, headings, dark surfaces              |
| Soft White  | `#F7F8FC` | primary light background                    |

Type: **Plus Jakarta Sans**. Animations respect `prefers-reduced-motion`
(non-essential motion is stripped via `src/client/index.css` and per-component
guards).

## Owner Command Center (`/admin`)

A private operational backend for the VIBIN owner. It is **not** a normal app
feature and is not linked from anywhere in the product.

**Access is never URL-based.** Even with the route, you cannot get in without a
live, MFA-verified *admin session* whose account has `role = 'owner'`. That is
re-checked server-side on every `/api/admin/cc/*` request. A normal
`vibin_session` grants nothing here — the admin session is a separate,
DB-backed, 12-hour, `vibin_admin` cookie.

### First-time setup

1. Set `ENCRYPTION_KEY` (required) and optionally `OWNER_RECOVERY_SECRET` as
   secrets — see [Environment variables](#environment-variables).
2. Open `/admin`. While no owner exists it shows **Set up owner**.
3. Enter the owner email + password → scan the TOTP QR in an authenticator app
   (Google Authenticator, 1Password, Authy…) → enter the 6-digit code.
4. **Save the 10 recovery codes shown once.** Setup then locks itself; the
   setup screen never returns.

### Signing in

`email + password` → `TOTP code` (or a one-time recovery code). Sessions are
listed under **Security**; *Revoke all* logs out every other device.

### If you lose the authenticator

- Use a **recovery code** at the code prompt (single-use; regenerate from
  **Security** — old codes then stop working).
- If you also lose the codes: `POST /api/admin/auth/recover` with
  `OWNER_RECOVERY_SECRET` + the owner email. It is rate-limited (3/hour),
  audited, grants **no session**, and simply emails a password-reset link and
  clears MFA so you can re-enrol. There is **no master password and no
  backdoor** — if `OWNER_RECOVERY_SECRET` is unset, this path is disabled.

### What's in it

- **Dashboard** — users / groups / swipes / matches / catalogue counts with a
  date-range picker (Today … Custom) and period-over-period deltas, honest
  service checks, and a "needs attention" list. Every number is a live query;
  where there genuinely isn't data yet the UI says so rather than inventing
  one.
- **Data browsers** — Users, Groups, Activities, Providers: search, filter,
  sort, pagination, and detail pages that cross-link (user ↔ group ↔ activity
  ↔ provider). No passwords, hashes, tokens or cookies are ever in a payload.
- **Analytics** — per-activity behaviour (views, likes, passes, like rate,
  matches, match rate, plans, plan conversion, booking clicks), category
  roll-ups, ranking leaderboards, a signup-cohort **funnel**, and **D1/D7/D30
  retention** (both gated behind a minimum sample size).
- **Ops** — error centre (server + client errors grouped, no bodies/PII),
  system health (timed D1/KV probes, table sizes, migrations, event volume),
  feature flags, and **maintenance mode**: when on, the whole normal-user API
  returns 503 and the SPA shows a maintenance screen, while `/api/health`,
  `/api/status` and the entire Command Center stay reachable.
- **Security** — audit-log viewer (filter by action/actor/range), admin
  session list + revoke / revoke-all, recovery-code regeneration and 2FA
  reset (password re-entry required).

### Provider CRM

Each provider has a pipeline **status** (`not_contacted` → `contacted` →
`interested` → `partner` / `not_interested` / `follow_up` / …), a set of
**business contacts** (name, email, phone, website, contact page, person,
role, address — business data only, kept where legitimately obtained), and a
manual **communication log** (email / call / meeting / note). Nothing is sent
automatically and nothing is fabricated — you open the mail client or website
yourself and record what happened. The provider page also shows aggregated
performance across that provider's activities.

### Credential vault

Provider/portal/test credentials are stored in a dedicated table, each value
**AES-256-GCM encrypted** with `ENCRYPTION_KEY` (which lives only in deployment
secrets — never in the DB, the frontend, logs or analytics). List and detail
responses omit the ciphertext entirely; values are masked in the UI and
revealing one requires a fresh **password re-entry** (wrong password → 403).
Every create / view / update / delete is written to a per-credential access
log **and** the audit log — the action and the credential name only, never the
secret.

### Data model added for the Command Center

Migration `0001`: `admin_sessions`, `admin_totp`, `admin_recovery_codes`,
`audit_log`, `analytics_events`, `feature_flags`, `system_settings`, plus
`role='owner'` on `users`.
Migration `0002`: `provider_contacts`, `provider_communications`,
`providers.crm_status`, `credentials`, `credential_access_log`.

Analytics events are emitted from the existing swipe/match/date/plan routes
and a rate-limited `/api/events` endpoint for client-only signals
(impressions, booking clicks, calendar actions, front-end errors). Server
5xx faults are recorded as `server_error` events (route + status + truncated
message only).

### Tests

`tests/admin-auth.mjs` (24 checks — setup, TOTP, recovery codes, session
management) and `tests/admin-security.mjs` (16 checks — unauthorized access to
every surface, privilege escalation, admin CSRF, vault ciphertext isolation,
password-gated reveal, audit-log secret hygiene, maintenance-mode bypass).
Both run in CI against a live local Worker.

## Security & GDPR

- Passwords: PBKDF2-SHA-256, six chained 100k rounds (≈600k; Workers caps a
  single call at 100k), per-user salt, constant-time verify.
- Sessions: opaque KV-backed id in an `HttpOnly; Secure; SameSite=Lax` cookie;
  per-user index for global logout on reset/delete.
- CSRF: double-submit token echoed in `X-Vibin-CSRF` on every non-GET.
- One authorization guard per group route — changing an id in a URL can't leak
  another group's data (tested).
- Rate limiting on auth + write endpoints (KV; disabled when `APP_ENV=development`).
- Zod validation on every body/query; `secureHeaders` on the API.
- GDPR: in-app JSON data export + hard account deletion (FK cascade), minimal
  collection, no continuous location, Privacy Policy + Terms pages, private
  routes disallowed in `robots.txt`.

## Known limitations & next steps

**Limitations (MVP, by design):**

- Realtime is polling (4–15s). Every endpoint returns a discrete state snapshot,
  so a Durable Object per group can drop in later without changing callers.
- Seed activities are `needs_review` and photo-less — see
  [Activity data](#activity-data-real-verified). Verify + add provider photos
  before a public launch.
- Email needs a provider wired in `src/worker/lib/email.ts` (Resend stub).
- Radius filtering is done in JS over a small dataset (correct haversine).
- `vibin.be` DNS must be attached manually (above).
- Admin UI is functional but minimal.
- Legal pages are templates — have them reviewed before launch.

**Next steps:** Durable Object realtime · real `ActivityProvider` integrations
behind the existing abstraction · provider-approved photos + an image pipeline ·
web-push on the existing `notification_prefs` · spatial index for radius ·
richer admin (bulk verify, provider config, analytics).

## License

Private / all rights reserved.
