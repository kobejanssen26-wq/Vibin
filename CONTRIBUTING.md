# Contributing to VIBIN

## Ground rules

- **The core loop is sacred.** `GROUP → set the vibe → SWIPE → UNANIMOUS MATCH →
  DATE MATCH → PLAN → BOOK`. No discovery/explore feed. No feature that lets a
  non-unanimous result become a match.
- **Voting is server-authoritative.** Never trust client state for a match.
- **No fabricated data.** Activities must be real, verifiable venues with real
  provider links. A group price is never presented as a per-person price.
  New activities ship as `needs_review`, not `verified`.
- **Type safety end to end.** `npm run typecheck` (worker + client + node) must pass.
- **Respect the brand tokens.** VIBIN Blue `#3155FF`, Lime `#B8F23D` (accent
  only), Navy `#101426`, Soft White `#F7F8FC`. No new primary colour.
- **Respect `prefers-reduced-motion`** in any new animation.

## Setup

See [README.md → Local development](README.md#local-development).

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local && npm run db:seed:local
npm run dev
```

## Before you push

```bash
npm run typecheck
npm test
npm run build
BASE=http://127.0.0.1:8787 node tests/integration.mjs   # with a Worker running
```

CI runs all of the above; deploy happens only from `main`.

## Schema changes

1. Edit `src/worker/db/schema.ts`.
2. `npm run db:generate` — commit the generated file in `migrations/`.
3. Never edit a migration that has already been committed/applied — add a new one.
4. Update `seed/activities.ts` if the change affects activity fields.

## Adding / updating activities

- Edit `seed/activities.ts`. Every entry needs a real `provider`,
  `providerWebsite`, `city`, a `sourceUrl` (the page you checked) and an honest
  `priceType`.
- Bump `SEED_VERIFIED_ON` when you re-check the batch.
- `npm run db:seed:build` regenerates `seed/seed.sql` (git-ignored).
- In production, an admin flips an activity to `verified` in `/admin` after
  re-checking it — that stamps `last_verified_at`.

## Code style

- One file per resource group in `src/worker/routes/`, one file per screen in
  `src/client/pages/`. Keep components small.
- Pure decision logic goes in `src/worker/engine/` with a matching `*.test.ts`.
- DTOs are hand-written in `src/shared/types.ts` — never return raw DB rows,
  and never leak another member's individual vote.
- Every group-scoped route calls `requireGroupMember` / `requireGroupCreator`
  before touching data.
- Bulk inserts go through `lib/chunk.ts` (D1's 100-bound-param limit).

## Commit messages

Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). Keep the
subject under ~72 chars; explain the *why* in the body.
