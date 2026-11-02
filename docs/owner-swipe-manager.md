# Owner Swipe Manager

A private page in the Owner Command Center (`/admin/swipe`) where the owner reviews every activity as a
card: **left = delete**, **right = keep**, **up = later**. The owner's verdict outranks every automatic
process (imports, the rule audit, the AI research).

## What a verdict means

| Verdict | Effect |
|---|---|
| **keep** | The activity may stay in VIBIN. If it was hidden (by the audit or an earlier delete) it becomes visible again. It does **not** change verification: kept ≠ verified. Research may keep investigating it but can never hide it. |
| **delete** | Soft delete: `activities.active = 0`, `status = 'inactive'`. The row, its id and every relation (votes, matches, plans, statistics) stay intact. An `activity_audits` row with `source = 'owner'` is written. No import, audit or research step may bring it back. |
| **later** | Skipped for now. Nothing about the activity changes. |
| **none** | Only through *undo*: "not reviewed yet" again. |

## Data model (migration `0016_owner_swipe.sql`)

* `owner_activity_decisions` – one row per activity: `decision`, `version` (optimistic lock, only ever goes up),
  `prev_active/prev_status` (the visible state a deleted activity returns to), `title_key/url_key` (so a deleted venue
  that comes back under a new id is recognised), `reresearch` (owner asked for research).
  **No foreign key** on purpose: the seed refreshes activity rows with `INSERT OR REPLACE`, and a cascading FK would let a
  reseed wipe the owner's verdict.
* `owner_decision_log` – append-only. Holds the exact state before each change (activity, decision row and audit row as
  JSON) so *undo* restores it precisely.

## API (`/api/admin/cc/swipe/*`, behind `withAdminSession + requireOwner()`)

`GET queue` · `GET summary` (`?light=1` = cheap, decisions only) · `GET suggest` · `GET activity/:id` · `GET recent` ·
`POST decide` · `POST undo` · `POST reresearch` · `POST activities` (add). Editing reuses `PUT /cc/activities/:id`.

Access is enforced on **every request** server-side: admin session, completed MFA, account still `role = owner`, plus the
admin CSRF header on every write. The hidden front-end route is not a security measure.

### Sync / conflicts

* Every change carries `expectedVersion` (what the screen saw). The decision, the visibility change, the audit row and the
  log entry are **one D1 batch**; every dependent statement is conditional on the decision row carrying the new version, so
  a lost race changes nothing. A stale or concurrent change answers **409 `version_conflict`**.
* The screen keeps a ledger of every decision: *saving → saved (server confirmed) / failed / conflict*. The banner only says
  "Alles opgeslagen" when nothing is pending or failed, and the browser warns before leaving with unsaved decisions.

## Who respects the verdict

| Path | Guard |
|---|---|
| AI research apply (`scripts/audit/make-research-sql.py`) | SQL checked **at apply time**: no website change / verification / hide for deleted; no hide for kept. A result produced before the owner deleted therefore cannot undo it. |
| Rule audit (`scripts/audit/make-sql.mts`) | `ON CONFLICT … WHERE source != 'owner'` instead of `INSERT OR REPLACE`; no hide for kept/deleted. |
| Audit queue (`make-batches.py`) | Skips `delete` and `later`; `keep` (and re-research requests) first. |
| CSV import | Deleted ids and look-alikes (same name+city / same site) are reported as errors; checked again at confirm time. |
| Classic admin form / quick-verify / quality module | `PUT active:true`, `verify`, `approve` on a deleted activity → 409; "restore rule" skips them; creating a look-alike requires `?allowExcluded=1`. |
| Seed (`seed/apply-seed.mjs`) | Re-asserts deletes (and audit-hidden rows) as the last step after a reseed. |
| Public app | Group swipe queue only shows `active = 1`; a vote on a removed activity is refused (409). Existing votes/matches/plans are kept. |

## Resuming the audit (phase 3)

1. Apply migration 0016 to the remote D1 before deploying.
2. Re-export `activities` + `owner_activity_decisions` into the working DB and rebuild the queue with
   `make-batches.py` – it now only queues what the owner kept (and not-yet-reviewed ones, after those), never deleted/later.
3. The research agents' unapplied results (batches finished while the audit was paused) are applied with the new guards.

## Tests

* `src/worker/lib/owner-swipe.test.ts` – the rules (vitest).
* `tests/swipe.mjs` – drives the real API on a throw-away local D1 (all 12 scenarios of the brief, optimistic locking,
  a real run of the research SQL generator while the owner deletes).
