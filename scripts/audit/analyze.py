#!/usr/bin/env python3
"""
Mechanical audit of the whole catalogue (read-only; works on a local copy of the export).

  python3 -I scripts/audit/analyze.py <local.db> <evidence.jsonl> <out_dir>

Inputs : a sqlite copy of the exported tables and the output of crawl-evidence.mjs.
Outputs: out_dir/profile.json   one record per active activity (flags + crawl comparison)
         out_dir/clusters.json  activities that share a website host / address / e-mail
         out_dir/queue.json     ids that need deep research, with the reasons
Nothing is written to the database and nothing is decided as "verified" without the
official website saying so.
"""
import json, math, os, re, sqlite3, sys, unicodedata
from collections import Counter, defaultdict

db_path, ev_path, out_dir = sys.argv[1:4]
os.makedirs(out_dir, exist_ok=True)
db = sqlite3.connect(db_path)
db.row_factory = sqlite3.Row


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.replace("&", " en ")).strip()


STOP = set("de het een the and en van der den la le les du des of in at op bij te aan voor met museum musee brouwerij brasserie restaurant cafe bar club park centre center centrum antwerp antwerpen gent brussel brussels bruxelles".split())


def tokens(s):
    return [t for t in norm(s).split() if len(t) >= 3 and t not in STOP]


# words that show the site offers something to visit or do (nl / fr / en), on normalised text
VISIT = re.compile(r"\b(bezoek|bezoeken|rondleiding|visite|visites|visit|tickets?|ticket|openingsuren|reserv\w*|boek\w*|book\w*|workshops?|activiteit\w*|activit\w+|activities|escape|klim\w*|boulder\w*|climb\w*|karting|museum|musee|tentoonstelling\w*|expo\w*|exhibit\w*|zwem\w*|spa|sauna|wellness|brouwerij|brasserie|proef\w*|tasting|degustation|park|speel\w*|attractie\w*|ervaring\w*|experience|avontuur|adventure|bowling|paintball|lasergame|minigolf|golf|padel|tennis|kajak\w*|kayak\w*|fiets\w*|wandel\w*|toegang|entree|tarieven|prijzen|collectie|kasteel|chateau|dierentuin|zoo|aquarium|theater|cinema|bioscoop|concert|show|trampoline|arcade|vr|simulator|planetarium)\b")


def host_of(url):
    m = re.match(r"^(?:https?://)?([^/?#:]+)", (url or "").strip(), re.I)
    if not m:
        return None
    h = m.group(1).lower()
    h = h[4:] if h.startswith("www.") else h
    parts = h.split(".")
    if len(parts) > 2 and ".".join(parts[-2:]) in ("co.uk", "com.au"):
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else h


def dist_m(a, b):
    if a["lat"] is None or b["lat"] is None:
        return None
    dl = (a["lat"] - b["lat"]) / 1e6 * 111000
    dg = (a["lng"] - b["lng"]) / 1e6 * 111000 * math.cos(a["lat"] / 1e6 * math.pi / 180)
    return math.hypot(dl, dg)


acts = {r["id"]: dict(r) for r in db.execute(
    """select id,title,provider,subcategory,category_id,address,city,lat,lng,website_url,source,
              web_status,status,description,short_description,image_is_generic,price_confidence
       from activities where active=1""")}

ev = {}
for line in open(ev_path):
    try:
        o = json.loads(line)
        ev[o["id"]] = o
    except Exception:
        pass

# contacts reachable per activity (implicit link: same website domain org)
org_of = defaultdict(list)
for l in db.execute("select org_id, activity_id from outreach_org_activities"):
    org_of[l["activity_id"]].append(l["org_id"])
contacts_of_org = defaultdict(list)
for c in db.execute("select id,org_id,email,kind,verification,source_type,source_url,domain_matches from outreach_contacts"):
    contacts_of_org[c["org_id"]].append(dict(c))

profile = {}
for aid, a in acts.items():
    p = {"id": aid, "title": a["title"], "city": a["city"], "site": a["website_url"], "flags": []}
    e = ev.get(aid)
    if not a["website_url"]:
        p["site_state"] = "no_website"
        p["flags"].append("no_website")
    elif e is None:
        p["site_state"] = "not_crawled"
        p["flags"].append("not_crawled")
    elif not e.get("ok"):
        err = e.get("error") or "error"
        p["site_state"] = (
            "robots" if err == "robots-disallow"
            else "dead" if err in ("http-404", "http-410") or "ENOTFOUND" in err or "ECONNREFUSED" in err
            else "blocked" if err in ("http-403", "http-429", "http-503", "http-401")
            else "unreachable"
        )
        p["site_error"] = err
        p["flags"].append("site_" + p["site_state"])
    else:
        p["site_state"] = "parked" if e.get("parked") else "alive"
        if e.get("parked"):
            p["flags"].append("site_parked")
        page = norm(" ".join([e.get("title") or "", " ".join(e.get("headings") or []), e.get("metaDescription") or "", e.get("text") or ""]))
        host_text = norm((a["website_url"] or "").split("//")[-1].split("/")[0].replace(".", " ").replace("-", " "))
        has_content = (e.get("textLength") or 0) >= 200
        nm = 0.0
        for cand in (a["title"], a["provider"]):
            tk = tokens(cand)
            if tk:
                nm = max(nm, sum(1 for t in tk if t in page) / len(tk))
                # the domain itself often carries the name ("kustbrouwerij.be")
                squashed = host_text.replace(" ", "")
                nm = max(nm, sum(1 for t in tk if t in host_text or t in squashed) / len(tk))
        p["name_match"] = round(nm, 2)
        p["has_content"] = has_content
        if not has_content:
            p["flags"].append("site_no_content")
        elif nm < 0.5:
            p["flags"].append("name_mismatch")
        if has_content and not VISIT.search(page):
            p["flags"].append("no_visit_signal")
        # city / postcode
        city = norm(a["city"])
        pc = re.findall(r"\b([1-9]\d{3})\b", a["address"] or "")
        pcs = [x.split(" ", 1) for x in (e.get("postcodes") or [])]
        site_pcs = {x[0] for x in pcs}
        site_cities = {norm(x[1]) for x in pcs if len(x) > 1}
        text_all = page + " " + norm(e.get("contactText") or "")
        city_ok = bool(city) and (city in text_all or any(city in c or c in city for c in site_cities))
        pc_ok = bool(pc) and any(x in site_pcs for x in pc)
        p["city_on_site"] = city_ok
        p["postcode_on_site"] = pc_ok if pc else None
        if city and not city_ok:
            p["flags"].append("city_not_on_site")
        if pc and site_pcs and not pc_ok:
            p["flags"].append("postcode_not_on_site")
        if e.get("closedSignal"):
            p["flags"].append("closed_signal")
            p["closed_signal"] = e["closedSignal"]
        if e.get("redirectedToOtherHost"):
            p["flags"].append("redirect_other_host")
        p["site_emails"] = [x["email"] for x in e.get("emails", [])]
    # emails in DB for this activity vs site
    db_contacts = []
    for oid in org_of.get(aid, []):
        db_contacts += contacts_of_org.get(oid, [])
    p["db_emails"] = sorted({c["email"] for c in db_contacts})
    if p.get("site_emails") is not None and p["db_emails"]:
        missing = [x for x in p["db_emails"] if x not in p["site_emails"]]
        if missing:
            p["flags"].append("db_email_not_on_site")
        p["db_email_not_on_site"] = missing
    # catalogue-side flags
    if not a["address"]:
        p["flags"].append("no_address")
    if a["status"] == "needs_review":
        p["flags"].append("never_verified")
    profile[aid] = p

# ---------- clusters: same website host (+ distance) and shared e-mail ----------
by_host = defaultdict(list)
for aid, a in acts.items():
    h = host_of(a["website_url"])
    if h:
        by_host[h].append(aid)
clusters = []
dup_candidates = set()
for h, ids in by_host.items():
    if len(ids) < 2:
        continue
    pairs = []
    for i, x in enumerate(ids):
        for y in ids[i + 1:]:
            d = dist_m(acts[x], acts[y])
            pairs.append((x, y, d))
    near = [pr for pr in pairs if pr[2] is not None and pr[2] < 150]
    for x, y, _ in near:
        dup_candidates.update([x, y])
    ds = [pr[2] for pr in pairs if pr[2] is not None]
    rel = "same_location" if ds and max(ds) < 150 else ("different_locations" if ds else "unknown_location")
    clusters.append({"kind": "host", "key": h, "ids": ids, "relation": rel, "near_pairs": [[x, y, round(d)] for x, y, d in near]})

# near-identical locations with different hosts (name similarity) — duplicate candidates
cells = defaultdict(list)
for aid, a in acts.items():
    if a["lat"] is None:
        continue
    cells[(round(a["lat"] / 2000), round(a["lng"] / 2000))].append(aid)
for aid, a in acts.items():
    if a["lat"] is None:
        continue
    cx, cy = round(a["lat"] / 2000), round(a["lng"] / 2000)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for o in cells.get((cx + dx, cy + dy), []):
                if o <= aid:
                    continue
                d = dist_m(a, acts[o])
                if d is None or d > 120:
                    continue
                ta, tb = set(tokens(a["title"] + " " + (a["provider"] or ""))), set(tokens(acts[o]["title"] + " " + (acts[o]["provider"] or "")))
                if ta and tb and len(ta & tb) / min(len(ta), len(tb)) >= 0.5:
                    dup_candidates.update([aid, o])
                    clusters.append({"kind": "near_name", "key": f"{aid}|{o}", "ids": [aid, o], "relation": "same_location", "near_pairs": [[aid, o, round(d)]]})

# shared e-mail clusters across activities (via org links)
email_acts = defaultdict(set)
for aid in acts:
    for c in [c for oid in org_of.get(aid, []) for c in contacts_of_org.get(oid, [])]:
        email_acts[c["email"]].add(aid)
shared = {}
for em, s in email_acts.items():
    if len(s) < 2:
        continue
    L = [acts[i] for i in s]
    ds = [dist_m(x, y) for i, x in enumerate(L) for y in L[i + 1:]]
    ds = [d for d in ds if d is not None]
    cities = {norm(x["city"]) for x in L}
    if ds and max(ds) < 150:
        rel = "same_location"
    elif len(cities) > 1:
        rel = "different_cities"
    else:
        rel = "same_city_different_place"
    shared[em] = {"ids": sorted(s), "relation": rel}
    clusters.append({"kind": "email", "key": em, "ids": sorted(s), "relation": rel})

# ---------- research queue ----------
HARD = {"site_blocked", "site_no_content", "no_visit_signal", "site_dead", "site_unreachable", "site_parked", "no_website", "closed_signal", "name_mismatch", "postcode_not_on_site", "site_robots", "redirect_other_host", "not_crawled"}
audit = {r["activity_id"]: dict(r) for r in db.execute("select activity_id, outcome, rule, confidence, source from activity_audits")}
queue = {}
for aid, p in profile.items():
    why = [f for f in p["flags"] if f in HARD]
    if aid in dup_candidates:
        why.append("duplicate_candidate")
    if audit.get(aid, {}).get("outcome") == "manual":
        why.append("audit_manual")
    if aid in {i for s in shared.values() for i in s["ids"]}:
        why.append("shared_email")
    if "db_email_not_on_site" in p["flags"]:
        why.append("db_email_not_on_site")
    if why:
        queue[aid] = sorted(set(why))
confirmed = [aid for aid, p in profile.items() if aid not in queue and p.get("site_state") == "alive"]
summary = {
    "active": len(acts),
    "crawled_ok": sum(1 for p in profile.values() if p.get("site_state") == "alive"),
    "site_states": dict(Counter(p.get("site_state") for p in profile.values())),
    "flags": dict(Counter(f for p in profile.values() for f in p["flags"]).most_common()),
    "queue": len(queue),
    "queue_reasons": dict(Counter(r for v in queue.values() for r in v).most_common()),
    "mechanically_consistent": len(confirmed),
    "duplicate_candidates": len(dup_candidates),
    "shared_email_clusters": {k: v for k, v in Counter(s["relation"] for s in shared.values()).items()},
}
json.dump(profile, open(os.path.join(out_dir, "profile.json"), "w"))
json.dump(clusters, open(os.path.join(out_dir, "clusters.json"), "w"))
json.dump(queue, open(os.path.join(out_dir, "queue.json"), "w"))
json.dump(summary, open(os.path.join(out_dir, "summary.json"), "w"), indent=1)
print(json.dumps(summary, indent=1))
