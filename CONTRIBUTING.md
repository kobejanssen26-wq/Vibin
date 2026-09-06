# Contributing to Mingo

## Ground rules

- **The core loop is sacred.** `GROUP → FILTER → SWIPE → UNANIMOUS MATCH → DATE
  MATCH → PLAN → BOOK`. No general discovery/explore feed. No feature that lets a
  non-unanimous result become a match.
- **Voting is server-authoritative.** Never trust client state for a match.
- **No fake functionality.** A button either works or is clearly labelled
  unavailable. Don't fake live availability, payments, or realtime data.
- **Type safety end to end.** `npm run typecheck` must pass (worker + client +
  node projects).

## Setup

See [README.md → Local development](README.md#local-development).

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local && npm run db:seed:build && npm run db:seed:local
npm run dev
```

## Before you push

```bash
npm run typecheck
npm test
npm run build
# with a Worker running (npm run dev):
npm run test:integration
```

CI runs all of the above; deploys happen only from `main`.

## Making schema changes

1. Edit `src/worker/db/schema.ts`.
2. `npm run db:generate` — commit the generated file in `migrations/`.
3. **Never edit a migration that has already been committed/applied.** Add a new one.
4. Update `seed/activities.ts` if the change affects seed data, then
   `npm run db:seed:build`.

## Code style

- One file per resource group in `src/worker/routes/`, one file per screen in
  `src/client/pages/`. Keep components small — no mega-component.
- Pure decision logic goes in `src/worker/engine/` with a matching `*.test.ts`.
- DTOs are hand-written in `src/shared/types.ts` — never return raw DB rows, and
  never leak another member's individual vote.
- Every group-scoped route calls `requireGroupMember` / `requireGroupCreator`
  before touching data.
- Bulk inserts must go through `lib/chunk.ts` (D1's 100-bound-param limit).

## Commit messages

Conventional commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`). Keep the
subject under ~72 chars; explain the *why* in the body.

## Tests we especially care about

- 2/3 like → no match; 3/3 like → match; any nope → rejected.
- Date: unanimous yes/maybe → confirmed; one no → not chosen; no slot → `no_consensus`.
- User A cannot read/act on Group B (IDOR).
- Removed member cannot vote; expired/used invite cannot be used.
- Two near-simultaneous deciding votes → exactly one match, one plan.
