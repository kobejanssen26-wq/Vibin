#!/usr/bin/env python3
"""
Rebuilds the audit "working database" (a local SQLite copy of what the audit scripts read) from production.

  CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... python3 -I scripts/audit/export-working-db.py <local.db>

(In a cloud session the token is injected by the proxy: CLOUDFLARE_API_TOKEN=proxy-injected is enough.)

Read-only against production. Writes only <local.db> (replaced). Copies, in pages:
  activities (active rows only), activity_audits, activity_research (id + method only), outreach_org_activities,
  outreach_contacts, activity_contact_links, owner_activity_decisions.

Why this exists: the audit pipeline keeps its inputs/outputs in a scratch directory that a container reset can
wipe. The RESULTS live in production (activity_research etc.); everything else is rebuilt from production with
this script + crawl-evidence.mjs + analyze.py + make-batches.py (see docs/audit-pipeline.md).
"""
import json, os, sqlite3, subprocess, sys, time

out_path = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAGE = 400

TABLES = [
    # (table, where-clause, columns or "*")
    ("activities", "active = 1", "*"),
    ("activity_audits", None, "*"),
    ("activity_research", None, "activity_id, verdict, existence, suitability, method, researched_at"),
    ("outreach_org_activities", None, "*"),
    ("outreach_contacts", None, "*"),
    ("activity_contact_links", None, "*"),
    ("owner_activity_decisions", None, "*"),
]


def remote(sql):
    for attempt in range(6):
        p = subprocess.run(
            ["npx", "wrangler", "d1", "execute", "vibin-db", "--remote", "--json", "--command", sql],
            capture_output=True, text=True, cwd=root,
        )
        out = p.stdout
        try:
            return json.loads(out[out.index("["):])[0]["results"]
        except Exception:
            blob = p.stdout + p.stderr
            if "971" in blob or "throttl" in blob.lower() or "timeout" in blob.lower():
                time.sleep(10 * (attempt + 1))
                continue
            sys.exit(f"remote query failed:\n{blob[-700:]}")
    sys.exit("remote query kept failing (throttled)")


def sql_type(v):
    return "INTEGER" if isinstance(v, int) and not isinstance(v, bool) else "REAL" if isinstance(v, float) else "TEXT"


if os.path.exists(out_path):
    os.remove(out_path)
db = sqlite3.connect(out_path)
for table, where, cols in TABLES:
    last, n, created = 0, 0, False
    while True:
        w = f"rowid > {last}" + (f" AND ({where})" if where else "")
        rows = remote(f"SELECT rowid AS _rid, {cols} FROM {table} WHERE {w} ORDER BY rowid LIMIT {PAGE}")
        if not rows:
            break
        names = [k for k in rows[0].keys() if k != "_rid"]
        if not created:
            types = {k: "TEXT" for k in names}
            for r in rows:
                for k in names:
                    if r[k] is not None and types[k] == "TEXT":
                        types[k] = sql_type(r[k])
            db.execute(f'CREATE TABLE "{table}" (' + ", ".join(f'"{k}" {types[k]}' for k in names) + ")")
            created = True
        db.executemany(
            f'INSERT INTO "{table}" VALUES (' + ",".join("?" * len(names)) + ")",
            [[r[k] for k in names] for r in rows],
        )
        n += len(rows)
        last = rows[-1]["_rid"]
        if len(rows) < PAGE:
            break
    if not created:  # empty table: create a minimal shell so the scripts' SELECTs do not fail
        db.execute(f'CREATE TABLE "{table}" (activity_id TEXT)')
    db.commit()
    print(f"{table}: {n} rows", flush=True)
db.close()
print("saved", out_path)
