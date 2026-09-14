# VIBIN — working agreement

## Standing deploy policy

The user wants every finished, verified change shipped automatically — do not ask for
permission to commit, push, or deploy on this project. After a change is typechecked,
built, and (where practical) tested:

1. `git add` the relevant files (never `.dev.vars` — it's gitignored on purpose) and commit
   with a real message describing what changed and why.
2. `git push origin main`.
3. `npm run deploy` (builds the client, deploys the Worker to production at vibin.be).
4. If the change touched the DB schema, apply the migration to `--remote` D1 *before*
   deploying code that depends on it (`npx wrangler d1 migrations apply vibin-db --remote`).

Do this as a normal part of finishing a task, not as a separate step that needs sign-off.
Still pause and flag anything genuinely destructive or irreversible beyond normal deploys
(e.g. dropping data, force-pushing over others' work) — this blanket authorization covers
ordinary ship-it commits/pushes/deploys, not those.

## Two separate codebases

- **This repo (`mingo-1.2`)** is the website + backend: React/Vite client, Hono/Cloudflare
  Worker API, D1 database. This is what the policy above deploys — it's the entire live
  product at vibin.be.
- **`../vibin-mobile`** (sibling directory, `C:\Users\Kobej\code\vibin-mobile`) is a
  separate Expo/React Native project against the same backend. It does NOT auto-deploy the
  same way — native app releases go through EAS builds and App Store/Play Store review, a
  manual, multi-day process with no "just push it live" equivalent. If asked to build
  something "for the app" without qualification, confirm whether that means this web
  product or the native mobile project before assuming.

## Verify before shipping

"Deploy automatically" does not mean skip testing. Before the steps above: typecheck
(`npx tsc --noEmit -p tsconfig.json`), run the integration suite
(`BASE=http://127.0.0.1:8787 node tests/integration.mjs` against a local `wrangler dev`)
when the change touches backend behavior, and actually exercise UI changes in the browser.
Ship what's verified working, not what merely compiles.
