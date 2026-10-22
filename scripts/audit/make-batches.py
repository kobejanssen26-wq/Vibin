#!/usr/bin/env python3
"""
Builds the research batches for the agents (cluster-aware, highest-impact first).

  python3 -I scripts/audit/make-batches.py <local.db> <analysis_dir> <evidence.jsonl> <inputs_dir> [--size 8] [--skip-done <validated_dir>]

Activities that share a website host, a location or an e-mail address are kept in the SAME batch so
the agent sees all siblings at once and can tell different locations / activities from duplicates.
Order: activities that can be contacted (e-mail) or share an address first, then site problems,
then records without a website.
"""
import glob, json, os, sys
from collections import defaultdict
import sqlite3

db_path, an_dir, ev_path, in_dir = sys.argv[1:5]
size = int(sys.argv[sys.argv.index("--size") + 1]) if "--size" in sys.argv else 8
done = set()
if "--skip-done" in sys.argv:
    vd = sys.argv[sys.argv.index("--skip-done") + 1]
    for f in glob.glob(os.path.join(vd, "batch-*.json")):
        for r in json.load(open(f))["results"]:
            if "missing_result" not in r.get("validation", []):
                done.add(r["id"])
os.makedirs(in_dir, exist_ok=True)
db = sqlite3.connect(db_path)
db.row_factory = sqlite3.Row
profile = json.load(open(os.path.join(an_dir, "profile.json")))
queue = json.load(open(os.path.join(an_dir, "queue.json")))
clusters = json.load(open(os.path.join(an_dir, "clusters.json")))
acts = {r["id"]: dict(r) for r in db.execute("select * from activities where active=1")}
audit = {r["activity_id"]: dict(r) for r in db.execute("select * from activity_audits")}
ev = {}
for line in open(ev_path):
    try:
        o = json.loads(line)
        ev[o["id"]] = o
    except Exception:
        pass
org_of = defaultdict(list)
for l in db.execute("select org_id, activity_id from outreach_org_activities"):
    org_of[l["activity_id"]].append(l["org_id"])
contacts_of_org = defaultdict(list)
for c in db.execute("select id,org_id,email,kind,source_url,role from outreach_contacts"):
    contacts_of_org[c["org_id"]].append(dict(c))

# union-find over clusters (members that are in the queue pull in all their siblings)
parent = {}


def find(x):
    parent.setdefault(x, x)
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


for c in clusters:
    ids = [i for i in c["ids"] if i in acts]
    if len(ids) < 2 or c["kind"] == "email" and len(ids) > 12:
        continue  # very large e-mail groups (e.g. one agency address) are handled per activity
    for i in ids[1:]:
        parent[find(i)] = find(ids[0])
comp = defaultdict(list)
for aid in queue:
    comp[find(aid)].append(aid)
for aid in list(queue):
    root = find(aid)
    for c in clusters:
        pass
members = defaultdict(set)
for aid in acts:
    if aid in parent:
        members[find(aid)].add(aid)
groups = []
seen = set()
for aid in sorted(queue):
    if aid in seen or aid in done:
        continue
    root = find(aid)
    grp = sorted(members.get(root, {aid}) | {aid})
    grp = [g for g in grp if g not in done]
    for g in grp:
        seen.add(g)
    groups.append(grp)


def priority(grp):
    reach = any(any(contacts_of_org.get(o) for o in org_of.get(a, [])) for a in grp)
    shared = any("shared_email" in queue.get(a, []) for a in grp)
    dup = any("duplicate_candidate" in queue.get(a, []) for a in grp)
    site = any(any(f.startswith("site_") or f in ("closed_signal", "name_mismatch") for f in profile[a]["flags"]) for a in grp)
    nosite = all("no_website" in profile[a]["flags"] for a in grp)
    return (0 if reach else 1, 0 if (shared or dup) else 1, 0 if site else 1, 1 if nosite else 0, -len(grp))


groups.sort(key=priority)
# pack groups into batches of ~size, splitting oversized groups
batches, cur = [], []
for grp in groups:
    for i in range(0, len(grp), size):
        part = grp[i:i + size]
        if len(cur) + len(part) > size and cur:
            batches.append(cur)
            cur = []
        cur += part
        if len(cur) >= size:
            batches.append(cur)
            cur = []
if cur:
    batches.append(cur)


def rec(aid, batch_ids):
    a, p, e = acts[aid], profile[aid], ev.get(aid) or {}
    sibs = []
    for c in clusters:
        if aid in c["ids"] and c["kind"] != "email":
            for o in c["ids"]:
                if o != aid and o in acts:
                    sibs.append({"id": o, "title": acts[o]["title"], "city": acts[o]["city"], "via": c["kind"], "relation": c["relation"], "in_this_batch": o in batch_ids})
    con = []
    for oid in org_of.get(aid, []):
        con += contacts_of_org.get(oid, [])
    shared_with = []
    for c in clusters:
        if c["kind"] == "email" and aid in c["ids"]:
            shared_with.append({"email": c["key"], "other_activities": [{"id": o, "title": acts[o]["title"], "city": acts[o]["city"]} for o in c["ids"][:6] if o != aid and o in acts], "relation": c["relation"], "total": len(c["ids"])})
    au = audit.get(aid, {})
    return {
        "id": aid, "title": a["title"], "provider": a["provider"], "subcategory": a["subcategory"], "category": a["category_id"],
        "address": a["address"], "city": a["city"], "lat": a["lat"] / 1e6 if a["lat"] is not None else None, "lng": a["lng"] / 1e6 if a["lng"] is not None else None,
        "website_url": a["website_url"], "catalogue_description": (a["short_description"] or a["description"] or "")[:300],
        "current_audit": {"outcome": au.get("outcome"), "rule": au.get("rule"), "reason": au.get("reason")},
        "why_in_queue": queue.get(aid, []),
        "crawl": {"site_state": p.get("site_state"), "flags": p["flags"], "name_match": p.get("name_match"), "page_title": (e.get("title") or "")[:160], "final_url": e.get("finalUrl"), "postcodes_on_site": (e.get("postcodes") or [])[:8], "emails_on_site": [x["email"] for x in e.get("emails", [])][:8], "closed_signal": e.get("closedSignal"), "site_error": p.get("site_error")},
        "contacts": [{"id": c["id"], "email": c["email"], "kind": c["kind"], "found_on": c["source_url"]} for c in con][:8],
        "siblings_same_site_or_place": sibs[:10],
        "shared_email_with": shared_with[:4],
    }


for f in glob.glob(os.path.join(in_dir, "batch-*.in.json")):
    os.remove(f)
for i, b in enumerate(batches, 1):
    ids = set(b)
    json.dump({"batch": f"batch-{i:03d}", "activities": [rec(a, ids) for a in b]}, open(os.path.join(in_dir, f"batch-{i:03d}.in.json"), "w"), ensure_ascii=False)
print(f"{sum(len(b) for b in batches)} activities in {len(batches)} batches (size {size}); groups {len(groups)}")
