#!/usr/bin/env python3
"""
Copies the owner's Swipe Manager verdicts (and what is visible right now) from production into the audit working DB,
so the research queue never spends effort on something the owner deleted and works on what the owner kept first.

  CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... python3 -I scripts/audit/sync-owner-decisions.py <local.db>

Read-only against production (two SELECTs). Writes only the local working DB:
  * table owner_activity_decisions (created if needed, replaced by the production rows)
  * activities.active / status for rows production has meanwhile hidden (so they drop out of the queue)
"""
import json, os, sqlite3, subprocess, sys

db_path = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def remote(sql):
    p = subprocess.run(["npx", "wrangler", "d1", "execute", "vibin-db", "--remote", "--json", "--command", sql], capture_output=True, text=True, cwd=root)
    out = p.stdout
    try:
        return json.loads(out[out.index("["):])[0]["results"]
    except Exception:
        sys.exit(f"remote query failed:\n{(p.stdout + p.stderr)[-600:]}")


decisions = remote("SELECT activity_id, decision, version, reresearch FROM owner_activity_decisions")
hidden = remote("SELECT id, status FROM activities WHERE active = 0")

db = sqlite3.connect(db_path)
db.execute(
    "CREATE TABLE IF NOT EXISTS owner_activity_decisions (activity_id TEXT PRIMARY KEY, decision TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, "
    "prev_active INTEGER, prev_status TEXT, title_key TEXT, url_key TEXT, reresearch INTEGER NOT NULL DEFAULT 0, note TEXT, decided_by TEXT, decided_at INTEGER)"
)
db.execute("DELETE FROM owner_activity_decisions")
db.executemany(
    "INSERT INTO owner_activity_decisions (activity_id, decision, version, reresearch) VALUES (?,?,?,?)",
    [(d["activity_id"], d["decision"], d["version"], d["reresearch"]) for d in decisions],
)
changed = 0
for h in hidden:
    cur = db.execute("UPDATE activities SET active = 0, status = ? WHERE id = ? AND active = 1", (h["status"], h["id"]))
    changed += cur.rowcount
db.commit()
by = {}
for d in decisions:
    by[d["decision"]] = by.get(d["decision"], 0) + 1
print(json.dumps({"decisions": len(decisions), "by_decision": by, "newly_hidden_in_snapshot": changed}))
