#!/usr/bin/env python3
"""
Processes every research batch that has an agent output but is not applied yet:
validate (machine-check quotes) -> guarded SQL (agent results only) -> apply to D1 -> remember.

  CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
  python3 -I scripts/audit/process-new.py <work_dir> <local.db> <analysis_dir> <evidence.jsonl> [--dry]

work_dir contains in/, out/, validated/, applied.txt (created as needed).
Idempotent: a batch is only applied once; re-running does nothing for applied batches.
"""
import glob, json, os, shutil, subprocess, sys, tempfile

work, db, an, ev = sys.argv[1:5]
dry = "--dry" in sys.argv
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
applied_f = os.path.join(work, "applied.txt")
applied = set(open(applied_f).read().split()) if os.path.exists(applied_f) else set()
os.makedirs(os.path.join(work, "validated"), exist_ok=True)

new = []
for f in sorted(glob.glob(os.path.join(work, "out", "batch-*.json"))):
    name = os.path.basename(f)[:-5]
    if name in applied:
        continue
    try:
        json.load(open(f))
    except Exception:
        print(f"{name}: output not valid JSON yet, skipped")
        continue
    new.append(name)
if not new:
    print("nothing new")
    sys.exit(0)

# validate only the new batches
tmp_in = tempfile.mkdtemp()
tmp_out = tempfile.mkdtemp()
for n in new:
    shutil.copy(os.path.join(work, "in", f"{n}.in.json"), tmp_in)
    shutil.copy(os.path.join(work, "out", f"{n}.json"), tmp_out)
r = subprocess.run(["node", os.path.join(root, "scripts/audit/validate-research.mjs"), tmp_in, tmp_out, os.path.join(work, "validated")], capture_output=True, text=True)
print(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[-300:])

# SQL for the new batches only
tmp_val = tempfile.mkdtemp()
for n in new:
    shutil.copy(os.path.join(work, "validated", f"{n}.json"), tmp_val)
sql_dir = os.path.join(work, "sql-new")
shutil.rmtree(sql_dir, ignore_errors=True)
r = subprocess.run(["python3", "-I", os.path.join(root, "scripts/audit/make-research-sql.py"), db, an, ev, tmp_val, sql_dir, "--only-agent"], capture_output=True, text=True)
rep = json.load(open(os.path.join(sql_dir, "report.json")))
print({k: v for k, v in rep.items() if k in ("research_rows", "verdict_approved", "verdict_fix_data", "verdict_manual", "verdict_exclude", "verdict_duplicate", "verdict_closed", "hidden_by_research_closed", "hidden_by_research_exclude", "hidden_by_research_duplicate", "marked_verified", "website_corrections_applied", "duplicate_rejected", "exclude_unproven", "statements")})
if dry:
    sys.exit(0)
for f in sorted(glob.glob(os.path.join(sql_dir, "*.sql"))):
    p = subprocess.run(["npx", "wrangler", "d1", "execute", "vibin-db", "--remote", "--file", f], capture_output=True, text=True, cwd=root)
    out = p.stdout + p.stderr
    if p.returncode != 0 or "ERROR" in out:
        print("APPLY FAILED", f, out[-400:])
        sys.exit(1)
with open(applied_f, "a") as fh:
    fh.write("\n".join(new) + "\n")
print("applied:", ", ".join(new))
