# Provider outreach (Owner Command Center → Outreach)

A small tool to prepare and send a first, low-key introduction mail to activity
providers — **one owner-approved e-mail at a time**. It never decides on its own
who gets a mail, and nothing goes out in development, staging or tests.

> **Status: not legally approved.** The tool does not pretend otherwise: real
> sending stays blocked until the owner records a legal review in the settings.
> This document is not legal advice. **LEGAL REVIEW REQUIRED** (see below).

## What it does

1. **Aanbieders bijwerken** builds one *organisation* per website domain from the
   active activities (a business with eight activities is mailed once, not eight
   times). Existing records are never touched; only `outreach_*` tables are written.
2. **Contact discovery** reads the provider's *own* public website (homepage plus
   at most two contact-like pages), obeys `robots.txt`, identifies itself as
   `VIBINContactBot` and keeps volume low (10 sites per 30-minute cron run by
   default). It stores an address **with the page it came from**. It never guesses
   or composes addresses, never decodes hidden/obfuscated ones, and never uses
   third-party sources.
3. Each address is classified **generic** (info@, reservaties@ …), **personal**
   (jan.peeters@, gmail.com …) or **unknown**, and marked *gecontroleerd* only when
   it is a generic address on the organisation's own domain found on its own site.
4. The owner reviews a **draft** (full text including the automatic footer),
   **approves** it, and **sends** it with an explicit button. Selecting rows can
   only ever create drafts.
5. Optionally a **campaign**: only individually approved, not-yet-sent messages are
   queued and are sent at a throttled pace (cron, default 10 per 30 min, daily cap).

## Safety rules (enforced on the server, re-checked right before every send)

A message is **not** sent when any of these is true (see `evaluateSend` in
`src/worker/lib/outreach-core.ts`, covered by unit tests):

- recipient missing / invalid, or it no longer matches the stored contact;
- address is personal or not classified as a generic business address;
- address is not marked *gecontroleerd*, or its domain cannot receive mail (MX);
- organisation excluded, or address/domain on the do-not-contact list;
- no approval, or the text/recipient changed after approval (approval is pinned to
  a SHA-256 of recipient + subject + body);
- a real mail was already sent to that address or organisation;
- live mode requested but: not production, legal review not confirmed, sender /
  reply-to / contact address / sender identity missing, no provider key, no
  signing key for opt-out links, or the daily cap reached;
- the message was approved in another mode (test vs live).

Double clicks and retries cannot double-send: the row is claimed atomically
(`UPDATE … WHERE status IN ('approved','queued')`), a partial unique index allows
one live message per contact, and the provider call carries an `Idempotency-Key`.

## Modes

| Mode | Where | Behaviour |
|---|---|---|
| **test** (default) | anywhere | Never reaches a real recipient. With a *test inbox* configured the mail goes only there (subject `[TEST → address]`); without one it is a dry-run and nothing is sent. |
| **live** | production only | Real delivery via Resend, only after every blocker in *Instellingen* is cleared. |

Outside `APP_ENV=production` the provider is a mock — the worker never contacts
Resend, even if a key is present. `Instellingen → Echte verzending inschakelen` is
refused until the readiness checklist is empty, and withdrawing the legal review
switches back to test mode.

## Configuration (no code changes needed)

*Outreach → Instellingen*: sender name and address, reply-to, official contact
address, website, **sender identity** (company name, address, enterprise number —
required for live), test inbox, subject and body template (`{{provider}}`,
`{{website}}`, `{{contact}}`), pace (`perRun`, `dailyCap`), automatic discovery.
Nothing is invented: unset values simply block live sending.

The footer — sender identity, where the address was found, and the opt-out link —
is appended automatically and cannot be edited away.

Server-side secrets (never in the frontend or the repo): `EMAIL_API_KEY` (Resend),
`ENCRYPTION_KEY` (also signs the opt-out links).

## Opt-out and do-not-contact list

Every mail contains `https://<site>/optout/<token>` (also sent as
`List-Unsubscribe` / one-click `List-Unsubscribe-Post`). The token is an HMAC of the
message id: it cannot be forged and needs no extra storage. Opting out
immediately suppresses the address, excludes the organisation and cancels every
unsent draft/queue entry. Objections and complaints **cannot be deleted** from the
list; bounces, manual and legal entries can. Replies, bounces and complaints that
arrive by mail are logged manually on the organisation (*Verzendgeschiedenis en
antwoorden*); bounces/complaints/objections add the address to the list.

## Data model (migration `0012`, additive only)

`outreach_orgs`, `outreach_org_activities`, `outreach_contacts`,
`outreach_messages`, `outreach_campaigns`, `outreach_suppressions`,
`outreach_events`. Settings live in `system_settings` (`outreach_config`); actions
are written to `audit_log` (`outreach.*`). Activities keep their own ids; nothing
existing is changed or deleted.

## Email provider and deliverability

- Resend is already configured for transactional mail (verification/reset).
  Resend's acceptable-use policy prohibits "spamming" and enforces bounce
  (<4 %) and complaint (<0.08 %) limits — **cold outreach on the same
  account/domain can endanger transactional mail**. Recommended: a separate
  sending subdomain (e.g. `outreach.vibin.be`) with its own Resend domain/API key,
  and to confirm with Resend that this use is allowed.
- DNS today: SPF (Cloudflare routing + `send.vibin.be` for Resend) and DKIM are
  present; **no DMARC record exists** — add `_dmarc.vibin.be` (start with
  `p=none; rua=mailto:…`) before real sending.
- Resend webhooks (bounce/complaint) are **not** wired up: register those by hand
  on the organisation for now.

## Legal review (LEGAL REVIEW REQUIRED)

The tool is **not** legally approved; the owner records a review in the settings,
and real sending stays blocked until then. What was verified against official
text (Belgian Data Protection Authority, *Aanbeveling uit eigen beweging 01/2025
over de verwerking van persoonsgegevens bij direct marketing*, consultation
version, 70 pp.):

- **Rule** — art. XII.13 §1 Wetboek van economisch recht: e-mail advertising is
  forbidden without the prior, free, specific and informed consent of the
  recipient (annex, nos. 15–17).
- **Exception for legal persons** — art. 1, 2° of the royal decree of
  4 April 2003: no consent needed *when the recipient is a legal person and the
  electronic contact details used are impersonal* (annex, no. 28, p. 66).
- **Caution from the DPA** — a functional address (info@…) *can* be personal
  data when one person uses and manages it in their role and systematically signs
  with their name and function; being "functional" alone is not enough (no. 27).
  Hence: only generic addresses, blocked when uncertain, reviewed by a human, and
  sole traders / personal / freemail addresses never approved.
- **Right to object** — art. XII.13 §2 WER and art. 2 of the royal decree: clear
  information about the right to object, an efficient electronic way to do so,
  and on an objection: an **e-mailed receipt** within a reasonable time, taking
  the measures, and updating the lists (annex, nos. 19, fn. 126–128). The tool
  does all three: opt-out page + one-click header, immediate suppression, and an
  e-mailed receipt after the opt-out of a real message (recorded on the
  organisation; if it cannot be sent the note says so).
- **GDPR** still applies to any personal data involved (art. 14 information is
  given in the mail footer: source of the address and how to object).

Still open for the person who signs off (not verifiable from here): the exact,
current text of the royal decree and of art. XII.13 §2–4; the information
obligations on commercial communications (sender identification — the settings
require a *sender identity* line for exactly this reason); and whether your
specific recipients are legal persons using impersonal addresses. Public bodies
and sole traders need their own judgement (they are flagged `public_body`, or
classified personal/unknown and therefore blocked).

## State of the production data (first sync, 2026-10-15)

3,120 organisations were built from 5,892 active activities (3,748 activity
links). 484 were skipped at once (474 only have dead/parked/closed sites, 10 are
platforms or social networks). 203 domains carry several different provider
names (municipalities, nature agencies, chains) and are shown by their domain;
89 look like government/heritage/library sites and carry the `public_body` flag.
A rehearsal of the crawler on 30 random sites found an address for 14 of them,
of which 9 were generic addresses on the site's own domain (the only ones that
are marked *gecontroleerd*); personal and other-domain addresses were correctly
left unverified. The scheduler then checks 10 sites per 30 minutes (commercial
sites first), so full coverage takes about six days.

## Operating it

1. *Aanbieders bijwerken* → *Zoek contactgegevens* (or leave automatic discovery
   on). Review rows with warnings; open an organisation to see the source page.
2. In test mode: prepare drafts, open one, check the text, *Goedkeuren en
   verzenden* (dry-run or to the test inbox). *Testberichten wissen* rehearses again.
3. Fix the readiness blockers, record the legal review, then switch to live.
4. Approve messages one by one; send singly or start a campaign.

## Tests

```bash
npx vitest run src/worker/lib/outreach-core.test.ts   # rules (unit)
npm run test:outreach                                  # 12 scenarios over HTTP, local D1, mock provider
```

`tests/outreach.mjs` starts its own throw-away local D1 and `wrangler dev`; it
cannot send real mail.
