# Catalogue quality — what counts as a VIBIN activity

> **The rule.** A business is not admitted just because it has a physical
> location, a website or a commercial activity. There must be a concrete,
> relevant experience that a user can discover on VIBIN and do together with
> friends.

A *shop* (Leonidas, a bakery, a supermarket), an ordinary café/restaurant, a
library, a monument, a hall for hire or a sports hall is therefore **not** an
activity. A chocolate *workshop*, a themed or interactive restaurant, a museum,
an escape room, a climbing hall, a brewery that offers a visit… is.

## How it is enforced

`src/worker/lib/activity-quality.ts` is the single place that encodes the rule
(pure, unit-tested in `activity-quality.test.ts`). It is used by

| Where | What happens |
|---|---|
| `scripts/audit/run.mts` | the one-off audit of the whole catalogue |
| `seed/osm/build-osm-json.mjs` (`npm run osm:build`) | shops, libraries, ordinary markets, monuments … never enter the OSM catalogue |
| admin CSV import | rows the rules exclude are rejected with `Kwaliteitsregel (<rule>): <reason>` |
| admin "new activity" | blocked with the reason; the owner can override with `?force=1` |

Outcomes (stored per activity in `activity_audits`): **approved**, **fix_data**
(suitable, but data is missing/wrong — see `issues`), **manual** (not certain,
a human decides — stays visible), **exclude**, **duplicate**, **closed**.
AI/heuristics are an aid only: anything uncertain becomes `manual`.

Excluded / duplicate / closed activities are hidden **softly** (`active=0`,
`status='inactive'|'outdated'`). Nothing is deleted: the id, favourites, matches,
plans and statistics stay. `activity_audits.previous_active/previous_status` hold
the state before hiding, so everything is reversible.

## The admin screen

*Command Center → Catalogus-kwaliteit* shows the outcome counts, the data gaps
(no own photo, no real description, unreliable website, missing address/price),
the rules behind each outcome and the activities themselves, with **Goedkeuren /
Herstellen / Uitsluiten** per activity and **Regel ongedaan maken** to bring back
everything one rule hid. Owner decisions are never overwritten by the rules.

## How the first audit was done (2026-10-16)

1. Inventory + backup: 7,226 rows exported (`mingo-backups/2026-10-16-before-audit/activities.sql`,
   plus a light JSON); 5,892 were active.
2. Rules + the earlier website crawl (title, meta, text of 2,350 of the venues'
   own sites) → one verdict per active activity; duplicates found by identical
   name + city or ≤ 80 m with a (near-)identical name; the best row is kept
   (curated > described > own website > own photo > older).
3. Guarded SQL in batches (`scripts/audit/make-sql.mts`): a row is only hidden if it
   was not edited since the export (admin edits win).
4. Verified: audit counts match, the swipe deck / search / groups / matches /
   outbound-link tests still pass.

### What the audit could NOT do

It did not re-verify every venue against its live website or visit every address:
verdicts are based on the catalogue data, the venue-type standard above and the
crawl that already existed. Existence/opening status is only known where the
site reported a closure. ~4,400 listings still have only a category stock photo
(`photo_generic`) — they stay visible but are flagged; real photos need sourcing.

## Re-running

```bash
node scripts/audit/export.mjs            # fresh export of the catalogue (read-only)
npx tsx scripts/audit/run.mts         # verdicts -> data/audit/decisions.json
npx tsx scripts/audit/make-sql.mts    # guarded SQL batches in data/audit/sql/
# review, back up, then apply with: wrangler d1 execute vibin-db --remote --file data/audit/sql/NN.sql
```

D1 free tier bills every row read (5 M / day for the whole site) — keep exports
paged and avoid per-row subqueries on large tables.
