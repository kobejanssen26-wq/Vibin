# Developer access & the admin File Manager

Two additions to the Command Center (`/admin`): a **developer** role next to the owner, and a **File Manager**
that lets authorised people read and edit the project's source from the admin panel.

## Roles

| Role | What it is |
|---|---|
| **owner** | The single highest authority. Everything in the Command Center. Cannot be removed, demoted or managed by anyone. |
| **developer** | A normal VIBIN account (`users.role = 'developer'`, details in `developer_access`) that can also sign in to `/admin` — but only to the areas it was given. |

Developers sign in with the same VIBIN email + password, then a one-time authenticator code (same MFA as the owner).
They use the normal site as any user would. A signed-in staff admin session also passes the "Binnenkort" maintenance
gate, so the team can review the site while it is closed to the public.

### Permissions (set per developer on **Team / Developers**)

| Key | Grants | Default for a new developer |
|---|---|---|
| `catalogue` | Activities, categories, catalogue quality, images, rankings, CSV import, data quality | on |
| `support` | Help-desk tickets and user reports | on |
| `events` | Live events and ingestion sources | on |
| `files.read` | Browse and open files in the File Manager | on |
| `files.write` | Save changes to files (commits to GitHub). Implies `files.read` | **off** |
| `team.manage` | Invite/remove *other* developers (see below). Only the owner can grant it | **off** |

**Everything not listed is owner-only** (users, groups, settings, credential vault, outreach, Swipe Manager,
analytics, providers, feature flags, audit log, system). This is a default-deny gate in
`src/worker/lib/admin-rbac.ts` — a new admin route is owner-only until someone maps it to a permission.
The check runs on the server for every `/api/admin/cc/*` request; hiding a button is never the protection.

A developer with `team.manage` can invite/remove developers **without** `team.manage` and grant a subset of their own
permissions. They can never touch the owner, themselves, or another manager, and never grant `team.manage`.

### Inviting someone

1. **Team / Developers → Invite or add a developer**: email + permissions → **Create invitation**.
2. Copy the link and send it yourself. **Nothing is emailed by VIBIN.** The link is single-use, expires after 7 days
   and can be revoked while pending (the token is stored hashed).
3. The invitee opens it, sets a password (or confirms their existing VIBIN password) and links an authenticator app.
   Only then does the account get access.

An existing VIBIN user can also be added directly (by email). **Remove access** turns the account back into a normal
user and ends its admin sessions and MFA; the VIBIN account itself is kept. Every change is written to the audit log
(`team.*`, `files.*`).

## File Manager

Cloudflare Workers have no filesystem, so the "project directory" is the **GitHub repository**: the File Manager
reads and writes it through the GitHub Contents API. Saving a file creates a **commit** on the configured branch.
**Nothing changes on the live site until the next deploy** (`npm run deploy`, unchanged).

### One-time setup (owner)

1. GitHub → Settings → Developer settings → **Fine-grained personal access token**: only this repository,
   permission **Contents: Read and write**, nothing else. Set an expiry.
2. `npx wrangler secret put GITHUB_TOKEN` and paste the token. (Never in a file, never in the repo.)
3. `GITHUB_REPO` / `GITHUB_BRANCH` are plain vars in `wrangler.jsonc` (`kobejanssen26-wq/Vibin`, `main`). Until the
   secret exists the File Manager shows a "not configured" page with these steps.

Recommended: set `GITHUB_BRANCH` to a separate branch (create it first) and merge it through a pull request, or turn on
branch protection for `main`. Then edits made in the admin are reviewed before they can ever be deployed.

### Safety rules (server-side, `src/worker/lib/repo-files.ts`, `routes/admin-files.ts`)

- Only signed-in owner/developer sessions with MFA; `files.read` to view, `files.write` to save.
- Paths are normalised and validated: `..`, absolute paths, backslashes, `%`, control characters and over-long paths are
  rejected. Only paths inside the repository exist — there is no way to name anything else.
- **Never shown, read or written** (left out of folder listings; asking for one directly is refused with 403):
  `.env*`, `.dev.vars*`, `.git`, `node_modules`, `.wrangler`, `.claude`, key/certificate files (`*.pem`, `*.key`, …),
  `.npmrc`, `secrets*`, `credentials*`, SQLite/DB files. Secrets also never live in the repository — they are Worker
  secrets.
- **Owner-only to write** (developers can read them): the access-control and deployment files — `src/worker/index.ts`,
  `middleware/`, the admin auth/team/files routes, RBAC and crypto libs, `db/schema.ts`, `migrations/`, `wrangler.jsonc`,
  `package*.json`, `.github/`, `CLAUDE.md`, `scripts/audit/`. A denied attempt is audited as `files.write_denied`.
- Saves update **existing text files only** (no create / delete / rename), need the file's current version (`sha`) and
  fail with a clear conflict message if someone else changed it meanwhile. Binary files and files over 400 KB are not
  editable. Responses are `no-store`. Saves are rate-limited (60 / 10 min).
- The commit message is the first line the editor typed (or "Update <path>") plus "Edited via the VIBIN admin File
  Manager (owner|developer)". The audit log (`files.write`) records the exact account, path and commit.

### In the editor

Folder tree, tabs, CodeMirror 6 with syntax highlighting (TypeScript/JavaScript/JSX, HTML, CSS, JSON, Markdown, SQL;
other text as plain), status bar, **Ctrl/Cmd+S**, and unsaved-changes protection (browser unload, in-app navigation,
switching files). On a phone the tree opens as a drawer.

## Tests

- `npx vitest run` — path rules and the RBAC table (`src/worker/lib/*.test.ts`).
- `node tests/developer-access.mjs` — end-to-end API suite against a throw-away local D1 with a mock GitHub
  (invites, MFA, permissions, privilege-escalation attempts, file read/write/conflict, traversal and secret paths).
- `node tests/developer-access-ui.mjs` — Playwright check of the screens (desktop + phone).

## Known limits

- Edits are commits, not a live preview; deploying stays a manual step.
- No creating/deleting/renaming files or folders, and no binary uploads, from the admin.
- Invitations are copy-the-link, not emailed.
- One access token for the whole repository: protect it like any production credential (fine-grained, expiring,
  revoked when no longer needed).
