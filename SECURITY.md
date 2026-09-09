# Security policy

## Reporting a vulnerability

Email **security@vibin.be** (or contact@vibin.be) with:

- what you found and where (URL / endpoint / file),
- steps to reproduce,
- the impact you think it has.

Please do **not** open a public issue for anything exploitable. We'll acknowledge
within a few days and keep you updated while it's being fixed.

## Scope

In scope: the VIBIN web app and its API (`vibin.be`, `*.workers.dev`), the
Owner Command Center (`/admin`), authentication, session and CSRF handling,
authorization / IDOR, the activity data pipeline.

Out of scope: third-party providers linked from activity pages, findings that
require a compromised device or physical access, volumetric DoS, missing
best-practice headers with no demonstrated impact, and social engineering.

## What's already in place

- Passwords: PBKDF2-SHA-256 (chained rounds), per-user salt, constant-time verify.
- Sessions: opaque KV-backed id in an `HttpOnly; Secure; SameSite=Lax` cookie;
  per-user index for global logout on password reset / account deletion.
- CSRF: double-submit token on every non-GET request.
- Owner Command Center: separate DB-backed session, TOTP (RFC 6238) + one-time
  recovery codes, `requireOwner()` re-checked on every `/api/admin/cc/*` request.
- Credential vault: AES-256-GCM, key server-side only, password re-auth to
  reveal, every access logged.
- Rate limiting on auth, reset, verify, chat, group creation, client events.
- Input validation with zod on every request body; parameterised queries only.

## Do not commit secrets

`.dev.vars`, `.env*` (except the `.example` files) and `seed/seed.sql` are
git-ignored. Real keys go to `wrangler secret put` and GitHub Actions secrets,
never into a file. The values inline in `.github/workflows/ci.yml` are
throwaway CI-only test values.
