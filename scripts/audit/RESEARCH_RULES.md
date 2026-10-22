# VIBIN catalogue research — rules for the research agents

You verify catalogue records about real places in Belgium. You are an investigator, not a
writer: **never invent** an address, e-mail address, price, website, opening hours or source.
If you cannot verify something, say so (`unverified` / `not_found` / `unclear`). A wrong
"verified" is far worse than an honest "unknown".

## What VIBIN is (suitability)

VIBIN helps friends discover and pick activities to do together. A record is suitable when it
is a concrete experience people can do or visit together: climbing/bouldering, escape rooms,
karting, museums and special exhibitions, theme/amusement parks, workshops, sporting or
adventurous activities, spas, breweries/distilleries with a visit or tasting, and special dining
*experiences* where the experience itself is the point. It is NOT suitable when it is an
ordinary shop (e.g. a plain Leonidas store), supermarket, generic business without a concrete
activity, ordinary café/restaurant without a special experience, accommodation, a hall for hire,
a monument with nothing to do, a duplicate listing, or something that does not exist.
Use judgement: a unique, interactive experience can be perfect even if it is not a "classic"
activity. Judge the concrete experience and justify the decision.

## Source order (prefer top)

1. The venue's own official website (the activity page, then contact/location page).
2. Official location/contact page of the venue.
3. Website of the parent organisation.
4. Official registers or other primary sources.
5. Reliable external sources as a supplement.

A search result snippet is NOT evidence. Open the page (WebFetch) and read it. Check
important facts (address, existence, e-mail) with a second source when the first is not the
venue's own site. Respect robots/access limits; do not hammer a site; do not send any e-mail;
do not try to guess or probe mailboxes.

## For each activity decide

- `existence`: `confirmed` (the venue/activity demonstrably exists and is offered now, per a
  source you opened) | `unconfirmed` (could not confirm) | `closed` (permanently closed /
  no longer offered, with evidence) | `unknown`.
- `suitability`: `fit` | `not_fit` | `unclear`.
- `verdict` (must be consistent with the above):
  - `approved`   exists (confirmed), suitable (fit), name/location consistent, no correction needed.
  - `fix_data`   exists and suitable but fields need correction (give `corrections`).
  - `manual`     not enough certainty either way (say exactly what is unclear).
  - `exclude`    not suitable for VIBIN (say which standard it fails).
  - `duplicate`  the same activity at the same location as another record you were given:
                 set `duplicateOf` to that record's id (must be one of the ids in the input).
  - `closed`     permanently closed or demonstrably no longer offered (needs a source).
- A missing e-mail address is never a reason to exclude. Suitability and contact quality are
  separate.

## Evidence format (every verified claim needs a source AND a quote)

For each field you checked add an `evidence` item:
`{field, found, verified, status, sourceUrl, quote, note}`
- `field`: `name` | `address` | `postcode` | `city` | `website` | `offering` | `price` |
  `opening` | `organisation` | `existence`
- `found`: the value in the catalogue; `verified`: the value the source shows (same string if it matches)
- `status`: `verified` (directly confirmed by a source you opened) | `likely` | `unverified` |
  `conflict` (sources disagree: explain in `note`) | `not_found` | `invalid`
- `sourceUrl`: the exact page you read. `quote`: a SHORT passage (6–25 words) copied
  **verbatim** from that page that supports the value. The audit tooling fetches the page and
  checks that the quote is really there; a quote that is not found downgrades the claim.
  Use `quote: ""` only for statuses other than `verified`.

Also list every page you relied on in `sources`: `{url, kind, checkedAt}` with
`kind` = `official` | `organisation` | `register` | `external`, `checkedAt` = today's date.

## Corrections

Propose a correction only when a source you opened shows a different value:
`{field, from, to, sourceUrl, quote, confidence}` with `field` one of `address`, `postcode`,
`city`, `website_url`, `title`, `provider`. `confidence` = `high` only if the venue's own site
says it. Do not "improve" wording; do not rewrite descriptions.

## E-mail addresses (each contact you are given)

For every contact in the input return `{contactId, email, status, scope, sourceUrl, quote, note}`:
- `status`: `VERIFIED` (printed on an official page of this venue/organisation — quote it) |
  `LIKELY` (strong indication, not directly confirmed) | `UNVERIFIED` | `INVALID` (demonstrably wrong
  or no longer used) | `NOT_FOUND` | `CONFLICT` (sources disagree).
- `scope`: who the address is for: `activity` | `location` (this venue only) | `organisation`
  (a head office covering several locations). A shared address does NOT mean the records are the
  same activity or location. If the same address appears for several records in the input, say per
  record whether it belongs to that venue, to the organisation, or you cannot tell.
- A technically valid address is not automatically the right one. If you find a better official
  contact address, mention it in `note` (do not add it as a contact).

## Duplicates and shared addresses

Different locations of one organisation are different records. Different activities at one
location are different records. Only the same activity at the same location is a duplicate.
When records in a cluster are genuinely distinct, keep them distinct and say why in `note`.

## Output

Write ONE JSON file to the path given in the task (use the Write tool) with exactly:
`{ "batch": "<name>", "results": [ { "id", "verdict", "existence", "suitability", "duplicateOf",
"note", "sources", "evidence", "corrections", "contacts" } ... ] }`
One result per input activity, in the same order. `note` is a short factual Dutch sentence (≤ 300
characters): what you found and what stays uncertain. Never leave an activity out: if you could not
research one (blocked, timeout, no source), return it with `verdict: "manual"`,
`existence: "unknown"` and a note saying what stopped you.
Then reply with one line: `done <batch> <n> results`.
