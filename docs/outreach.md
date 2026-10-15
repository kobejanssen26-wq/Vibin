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

Findings to be verified by a qualified person against the official texts:

- Belgian economic-law code art. XII.13 (electronic direct marketing: opt-in as
  the rule), the 2003 royal decree, ePrivacy directive 2002/58/EC art. 13 and the
  GDPR; Belgian DPA recommendation 01/2025 on direct marketing.
- Secondary sources indicate that impersonal addresses of legal persons may be
  mailed without prior consent, while personal addresses and sole traders are
  treated as personal data / natural persons. The exact conditions were **not**
  verified here.
- The tool therefore only allows generic business addresses, blocks everything
  uncertain by default, and requires a documented legal review before live mode.

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
