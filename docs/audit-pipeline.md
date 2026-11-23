# Catalogue research pipeline (web research agents → validation → production)

The audit checks every active activity against the real world: does it exist, is it a fit for VIBIN, are address /
website / organisation / e-mail right, with a source URL and a verbatim quote per claim. Agents do the web research,
tooling machine-checks the quotes, and only checked results are written to production. Nothing is auto-mailed.

## What lives where

| What | Where | Survives a container reset? |
|---|---|---|
| Research results (`activity_research`), audit rows, applied corrections, owner verdicts | production D1 | yes |
| Scripts, rules for the agents, this document | this repo (`scripts/audit/`, `docs/`) | yes |
| Working copy of the data, website crawl, analysis, batch inputs/outputs, `applied.txt` | scratch directory (`<scratch>`) | **no**: rebuild it |

Because results are written to production as soon as a batch is validated, a reset only costs the *unfinished*
batches. The owner's Swipe Manager verdicts (`owner_activity_decisions`) always win: deleted/postponed activities are
never researched and a result produced before a deletion can never undo it (guards in the apply SQL).

## Rebuild after a reset (≈ 10 minutes, no model usage)

Credentials: a Cloudflare API token with *Account · D1 · Edit* (saved for `api.cloudflare.com`; in a cloud session
use `CLOUDFLARE_API_TOKEN=proxy-injected`, the proxy injects the real value). `npm ci` first (wrangler).

```bash
S=<scratch>            # e.g. the session scratchpad
export CLOUDFLARE_API_TOKEN=proxy-injected CLOUDFLARE_ACCOUNT_ID=4f67735f4c54821e8bce8010bca04c42
mkdir -p $S/research/{in,out,validated} $S/analysis $S/crawl

# 1. working database from production (read-only on prod)
python3 -I scripts/audit/export-working-db.py $S/local.db

# 2. website crawl of the activities that still need research (polite, robots.txt, resumable)
#    in.json = [{id, site, title, city}] for active activities without agent research that have a website
node scripts/audit/crawl-evidence.mjs $S/crawl/in.json $S/crawl/evidence.jsonl --concurrency 40

# 3. mechanical analysis (flags, clusters, queue) and the research batches (cluster-aware, owner-kept first)
python3 -I scripts/audit/analyze.py $S/local.db $S/crawl/evidence.jsonl $S/analysis
#    add every still-unresearched active activity to analysis/queue.json (value []) so that none is skipped,
#    then build the batches; --skip-done takes a dir of validated batch files (ids listed there are skipped)
python3 -I scripts/audit/make-batches.py $S/local.db $S/analysis $S/crawl/evidence.jsonl $S/research/in --size 4 --skip-done <dir>

# 4. apply loop (validates + applies every new research/out/batch-N.json once)
nohup bash scripts/audit/run-driver.sh $S > /dev/null 2>&1 &
```

## Research agents

An agent does one or more batches (`research/in/batch-N.in.json` → `research/out/batch-N.json`, one output file per
batch, written once). The whole task description is in `scripts/audit/AGENT_TASK.md`, so the launch message (the
`prompt` of the Agent call) is just:

```
Read /home/user/Vibin/scripts/audit/AGENT_TASK.md completely and do what it says.
SCRATCH=<scratch dir>
BATCHES=3141,3142,3143,3144
DATE=<today, YYYY-MM-DD>
```

Rules for the agents live in `scripts/audit/RESEARCH_RULES.md` (evidence format, verdicts, budget); `AGENT_TASK.md`
tells them which tools they may use (they must never call session-management tools such as `archive_session`: a cheap
agent once tried that while looking for a way to "finish").

### Which model researches what (policy)

* **Activities the owner kept in the Swipe Manager** (and the first, owner-kept batches in general): the default
  (strongest) model, one agent per batch of four. These are the activities that go live first, so the result must be
  as reliable as possible.
* **Everything else**: a cheaper model (`model: "haiku"` on the Agent call), one agent per *four consecutive
  batches* (`BATCHES=a,b,c,d`; it writes the four output files one after the other and replies
  `done batches a,b,c,d`). In the pilot this used about half the tokens per activity and was roughly 7 times faster.
  The machine validation of the quotes is identical, so a weak result is downgraded to `likely`/`manual` instead of
  being trusted. It researches leaner (typically 1-3 pages per activity), so more activities end as `manual`.
* Bookkeeping of what was launched lives in the scratch directory (`next.json`; `python3 -I scripts/audit/status.py <scratch>` prints the progress): batches below the
  pointers that have no output file are the ones whose agent is still running or died.
* Owner-kept activities whose cheap-model result ended as `manual` are re-run later with the default model when there
  is budget left.
* An agent that dies on a usage limit keeps its work: resume it with `SendMessage` (agent id) once the window has reset.
  Batches that have no transcript at all are simply launched again.

### Usage limits and cost (measured, 2026-11)

* Two limits apply to the whole account: a 5-hour window and a weekly window. Subagents that hit a limit die, but
  their work is saved: resume with `SendMessage` to the agent id (they continue where they stopped). A scheduled
  check-in (`send_later`) scheduled for *after* the reset wakes the session on time; a background `sleep` does not
  survive a container restart.
* Cost per activity is roughly 0.4-0.7M weighted tokens for the default model: ~45% internal reasoning, the rest
  re-reading context (every agent carries a fixed ~65k-token base context into every step). The number of tool calls
  per activity is the main lever: 12 is a ceiling, 6-8 is typical.
* Ten agents in parallel use up a whole 5-hour window in ~15 minutes; parallelism does not buy more work per window.
* Lowering an agent's reasoning effort needs the owner's explicit OK. Choosing a cheaper model per batch is allowed
  (the machine validation of quotes is the same).

## Validation and apply

`process-new.py` validates every new output (`validate-research.mjs`: ids/enums, `verified` needs source URL and a quote
that really occurs on the page, `approved` needs confirmed existence, corrections only when verified), turns the result
into guarded SQL (`make-research-sql.py`) and applies it with `wrangler d1 execute --remote`. Outputs of `manual`
verdicts and unresolved facts are reviewed by the owner under *Kwaliteit → Onderzoek*.
