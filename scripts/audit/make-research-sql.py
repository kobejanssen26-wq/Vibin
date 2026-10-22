#!/usr/bin/env python3
"""
Turns the audit evidence into guarded SQL chunks (nothing is executed here).

  python3 -I scripts/audit/make-research-sql.py <local.db> <analysis_dir> <evidence.jsonl> <validated_dir|-> <out_dir>

Per active activity:
  * agent result (validated)            -> method 'agent'
  * consistent official website (crawl) -> method 'crawl' (existence confirmed by the venue's own site)
  * otherwise                           -> no research row: it stays "niet onderzocht" (never presented as checked)

Safety rules baked in:
  * owner decisions (activity_audits.source = 'owner') are never overwritten
  * hiding is soft (active=0 + previous_* kept) and only when the row was not edited after the export
  * exclude needs a machine-verified source; duplicate needs a same-location, still-visible target
  * address / city / title corrections are only PROPOSED; only a verified website_url correction is applied
  * e-mail evidence only ever tightens (invalid/conflict -> outreach verification 'uncertain')
Outputs out_dir/NN.sql (<= 400 statements each) and out_dir/report.json.
"""
import glob, json, math, os, re, sqlite3, sys, time
from collections import Counter, defaultdict

db_path, an_dir, ev_path, val_dir, out_dir = sys.argv[1:6]
ONLY_AGENT = "--only-agent" in sys.argv  # write statements only for activities with an agent result
os.makedirs(out_dir, exist_ok=True)
for f in glob.glob(os.path.join(out_dir, "*.sql")):
    os.remove(f)
NOW = int(time.time())
TODAY = time.strftime("%Y-%m-%d", time.gmtime())
db = sqlite3.connect(db_path)
db.row_factory = sqlite3.Row


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return str(int(v)) if float(v).is_integer() else str(v)
    return "'" + str(v).replace("'", "''") + "'"


acts = {r["id"]: dict(r) for r in db.execute("select * from activities where active=1")}
audit = {r["activity_id"]: dict(r) for r in db.execute("select * from activity_audits")}
profile = json.load(open(os.path.join(an_dir, "profile.json")))
queue = json.load(open(os.path.join(an_dir, "queue.json")))
clusters = json.load(open(os.path.join(an_dir, "clusters.json")))
ev = {}
for line in open(ev_path):
    try:
        o = json.loads(line)
        ev[o["id"]] = o
    except Exception:
        pass
agent = {}
if val_dir != "-" and os.path.isdir(val_dir):
    for f in sorted(glob.glob(os.path.join(val_dir, "batch-*.json"))):
        for r in json.load(open(f))["results"]:
            agent[r["id"]] = r

org_of = defaultdict(list)
for l in db.execute("select org_id, activity_id from outreach_org_activities"):
    org_of[l["activity_id"]].append(l["org_id"])
contacts = {}
contacts_of_org = defaultdict(list)
for c in db.execute("select id,org_id,email,kind,verification,source_url from outreach_contacts"):
    contacts[c["id"]] = dict(c)
    contacts_of_org[c["org_id"]].append(c["id"])


def dist_m(a, b):
    if a["lat"] is None or b["lat"] is None:
        return None
    dl = (a["lat"] - b["lat"]) / 1e6 * 111000
    dg = (a["lng"] - b["lng"]) / 1e6 * 111000 * math.cos(a["lat"] / 1e6 * math.pi / 180)
    return math.hypot(dl, dg)


stmts = []
rep = Counter()
research_rows = {}  # activity id -> dict(verdict, existence, ...)


# Subcategories that are concrete experiences by nature. Anything else keeps suitability "unclear"
# (the rules screened it, but nobody checked the concrete offer), so it is never marked verified.
FIT_SUBS = {
    "museum", "escape room", "brewery", "brewery tour", "spa & sauna", "castle", "pottery workshop", "zoo", "bouldering", "padel",
    "padel club", "padel and tennis club", "theme park", "arcade", "board games", "golf", "bowling", "climbing", "indoor playground",
    "trampoline park", "karting", "paintball", "mini-golf", "laser game", "cooking workshop", "water park", "creative workshops",
    "e-bike rental", "botanical garden", "karaoke", "alpaca walk", "vineyard tour and tasting", "ceramics workshop", "cinema",
    "theatre", "private sauna", "private sauna & wellness", "private sauna and wellness", "nature reserve", "park", "historic site",
}


def crawl_record(aid):
    """Research record from the venue's own site, only when the site itself confirms the basics."""
    p, e, a = profile[aid], ev.get(aid), acts[aid]
    if aid in queue or p.get("site_state") != "alive" or not e or not e.get("ok"):
        return None
    base = audit.get(aid, {})
    verdict = base.get("outcome") if base.get("outcome") in ("approved", "fix_data") else None
    if not verdict:
        return None
    fit = (a["subcategory"] or "").strip().lower() in FIT_SUBS
    if verdict == "approved" and not fit:
        verdict = "manual"  # exists, but nobody checked that the concrete offer suits VIBIN
    url = e.get("finalUrl") or e.get("site")
    evidence = [
        {"field": "name", "found": a["title"], "verified": (e.get("title") or "")[:200], "status": "verified", "sourceUrl": url, "quote": (e.get("title") or "")[:200], "note": f"naam komt overeen met de website (overeenkomst {p.get('name_match')})", "machineChecked": True},
        {"field": "website", "found": a["website_url"], "verified": url, "status": "verified", "sourceUrl": url, "quote": "", "note": "website bereikbaar op " + TODAY, "machineChecked": True},
        {"field": "existence", "found": "actief", "verified": "website actief, geen sluitingssignaal", "status": "verified", "sourceUrl": url, "quote": "", "note": "geen sluiting of geparkeerd domein gevonden op de pagina", "machineChecked": True},
    ]
    if p.get("city_on_site"):
        evidence.append({"field": "city", "found": a["city"], "verified": a["city"], "status": "verified", "sourceUrl": url, "quote": a["city"], "note": "plaats komt op de website voor", "machineChecked": True})
    if p.get("postcode_on_site"):
        evidence.append({"field": "postcode", "found": a["address"], "verified": "postcode van het adres staat op de website", "status": "verified", "sourceUrl": e.get("contactUrl") or url, "quote": "", "note": "", "machineChecked": True})
    return {
        "verdict": verdict, "existence": "confirmed", "suitability": "fit" if fit else "unclear", "method": "crawl",
        "evidence": evidence, "sources": [{"url": url, "kind": "official", "checkedAt": TODAY}],
        "corrections": [], "duplicate_of": None,
        "note": "Website van de aanbieder bevestigt naam en bestaan (automatische controle)." + ("" if fit else " Geschiktheid van het concrete aanbod is niet apart onderzocht."),
    }


def agent_record(aid):
    r = agent.get(aid)
    if not r:
        return None
    return {
        "verdict": r["verdict"], "existence": r["existence"], "suitability": r["suitability"], "method": "agent",
        "evidence": r["evidence"], "sources": r["sources"], "corrections": r["corrections"],
        "duplicate_of": r.get("duplicateOf"), "note": r["note"], "contacts": r.get("contacts", []),
    }


recs = {}
for aid in acts:
    if ONLY_AGENT and aid not in agent:
        continue
    rec = agent_record(aid) or crawl_record(aid)
    if rec:
        recs[aid] = rec

# ---------- duplicates: only same-location, visible targets, no cycles ----------
for aid, rec in list(recs.items()):
    if rec["verdict"] != "duplicate":
        continue
    t = rec["duplicate_of"]
    ok = t in acts and t != aid and (recs.get(t, {}).get("verdict") not in ("duplicate", "exclude", "closed")) and (dist_m(acts[aid], acts[t]) or 1e9) < 150
    if not ok:
        rec["verdict"] = "manual"
        rec["note"] += " [duplicaat niet bevestigd: doel niet zichtbaar of niet op dezelfde locatie]"
        rec["duplicate_of"] = None
        rep["duplicate_rejected"] += 1

# ---------- exclude needs a machine-verified source ----------
for aid, rec in recs.items():
    if rec["verdict"] == "exclude" and not any(e["status"] == "verified" and e.get("machineChecked") for e in rec["evidence"]):
        rec["verdict"] = "manual"
        rec["note"] += " [uitsluiting niet met een gecontroleerde bron onderbouwd: handmatig]"
        rep["exclude_unproven"] += 1

# ---------- statements ----------
HIDE = {"exclude": "inactive", "duplicate": "inactive", "closed": "outdated"}
for aid, rec in recs.items():
    a = acts[aid]
    au = audit.get(aid, {})
    corr = rec["corrections"]
    # one verified website correction is applied; everything else stays a proposal
    auto = [c for c in corr if c["field"] == "website_url" and c.get("verified") and c.get("confidence") == "high" and c.get("from") == (a["website_url"] or "")]
    pending = [c for c in corr if c not in auto]
    stmts.append(
        "INSERT OR REPLACE INTO activity_research (activity_id,verdict,existence,suitability,method,evidence,sources,corrections,corrections_applied,duplicate_of,note,run_id,researched_at) VALUES "
        f"({q(aid)},{q(rec['verdict'])},{q(rec['existence'])},{q(rec['suitability'])},{q(rec['method'])},{q(json.dumps(rec['evidence'], ensure_ascii=False))},{q(json.dumps(rec['sources'], ensure_ascii=False))},{q(json.dumps(pending, ensure_ascii=False))},{0 if pending else 1},{q(rec['duplicate_of'])},{q(rec['note'][:500])},{q('audit-' + TODAY)},{NOW});"
    )
    rep["research_rows"] += 1
    rep["method_" + rec["method"]] += 1
    rep["verdict_" + rec["verdict"]] += 1
    for c in auto:
        stmts.append(f"UPDATE activities SET website_url={q(c['to'])}, updated_at={NOW} WHERE id={q(aid)} AND website_url={q(c['from'])};")
        rep["website_corrections_applied"] += 1
    owner = au.get("source") == "owner"
    if rec["verdict"] in HIDE and not owner and a["active"] == 1:
        reason = (rec["note"] or "Onderzoek: " + rec["verdict"])[:300]
        stmts.append(
            "INSERT INTO activity_audits (activity_id,outcome,rule,reason,confidence,issues,duplicate_of,hidden,previous_active,previous_status,source,decided_by,audited_at) VALUES "
            f"({q(aid)},{q(rec['verdict'])},'research_{rec['verdict']}',{q(reason)},'high','[]',{q(rec['duplicate_of'])},0,1,{q(a['status'])},'research',NULL,{NOW}) "
            f"ON CONFLICT(activity_id) DO UPDATE SET outcome=excluded.outcome, rule=excluded.rule, reason=excluded.reason, confidence='high', duplicate_of=excluded.duplicate_of, "
            f"previous_active=CASE WHEN activity_audits.hidden=1 THEN activity_audits.previous_active ELSE 1 END, previous_status=CASE WHEN activity_audits.hidden=1 THEN activity_audits.previous_status ELSE {q(a['status'])} END, "
            f"source='research', audited_at={NOW} WHERE activity_audits.source != 'owner';"
        )
        stmts.append(f"UPDATE activities SET active=0, status={q(HIDE[rec['verdict']])}, updated_at={NOW} WHERE id={q(aid)} AND active=1 AND updated_at<={a['updated_at']} AND NOT EXISTS (SELECT 1 FROM activity_audits u WHERE u.activity_id={q(aid)} AND u.source='owner');")
        stmts.append(f"UPDATE activity_audits SET hidden=1 WHERE activity_id={q(aid)} AND source='research' AND EXISTS (SELECT 1 FROM activities x WHERE x.id={q(aid)} AND x.active=0);")
        rep["hidden_by_research_" + rec["verdict"]] += 1
    elif not owner and rec["verdict"] in ("approved", "fix_data", "manual") and au and (au.get("outcome") != rec["verdict"] or rec["method"] == "agent"):
        reason = (rec["note"] or "Onderzoek")[:300]
        stmts.append(
            f"UPDATE activity_audits SET outcome={q(rec['verdict'])}, rule={q('research_' + rec['verdict'])}, reason={q(reason)}, confidence={q('high' if rec['verdict'] == 'approved' else 'medium')}, source='research', audited_at={NOW} "
            f"WHERE activity_id={q(aid)} AND source != 'owner' AND hidden=0;"
        )
        rep["audit_updated"] += 1
    if rec["verdict"] in ("approved", "fix_data") and rec["existence"] == "confirmed" and rec["suitability"] == "fit" and a["status"] == "needs_review":
        stmts.append(f"UPDATE activities SET status='verified', last_verified_at={NOW}, web_status='alive', web_checked_at={NOW} WHERE id={q(aid)} AND status='needs_review' AND active=1;")
        rep["marked_verified"] += 1

# ---------- contacts + links ----------
CS = {"VERIFIED": "verified", "LIKELY": "likely", "UNVERIFIED": "unverified", "INVALID": "invalid", "NOT_FOUND": "not_found", "CONFLICT": "conflict"}
contact_state = {}  # contact id -> (status, url, note)


def merge(cid, status, url, note):
    # The address itself is as good as its BEST link: one venue's verified link outweighs another venue's
    # "does not belong here" (that is a property of the link, which stays per activity).
    order = ["verified", "likely", "unverified", "not_found", "conflict", "invalid"]
    cur = contact_state.get(cid)
    if cur is None or order.index(status) < order.index(cur[0]):
        contact_state[cid] = (status, url, note)


link_rows = {}
for aid, a in acts.items():
    if ONLY_AGENT and aid not in agent:
        continue
    e = ev.get(aid) or {}
    site_emails = {x["email"]: x.get("page") for x in (e.get("emails") or [])} if e.get("ok") else None
    ag = {c["contactId"]: c for c in (agent.get(aid, {}).get("contacts") or [])}
    for oid in org_of.get(aid, []):
        for cid in contacts_of_org.get(oid, []):
            c = contacts[cid]
            status, url, note, scope, src = "unverified", None, "alleen via dezelfde website gekoppeld", "organisation", "domain"
            if site_emails is not None and c["email"] in site_emails:
                status, url, note = "verified", site_emails[c["email"]], "adres staat op de officiële website"
                if url and url == e.get("finalUrl"):
                    src = "page"
            elif site_emails is not None:
                note = "adres niet teruggevonden bij de controle van de website (kan op een andere pagina staan)"
            elif e and not e.get("ok"):
                note = "website was niet bereikbaar bij de controle"
            if cid in ag:
                x = ag[cid]
                status, url, note, scope = CS.get(x["status"], status), x.get("sourceUrl") or url, (x.get("note") or note)[:280], x.get("scope", scope)
                src = "page" if status == "verified" else src
            link_rows[(aid, cid)] = (scope, status, src, url, note)
            merge(cid, status, url, note)
for (aid, cid), (scope, status, src, url, note) in link_rows.items():
    stmts.append(
        "INSERT INTO activity_contact_links (activity_id,contact_id,scope,status,link_source,evidence_url,note,checked_at) VALUES "
        f"({q(aid)},{q(cid)},{q(scope)},{q(status)},{q(src)},{q(url)},{q(note)},{NOW}) ON CONFLICT(activity_id,contact_id) DO UPDATE SET scope=excluded.scope, status=excluded.status, link_source=excluded.link_source, evidence_url=excluded.evidence_url, note=excluded.note, checked_at={NOW} WHERE activity_contact_links.link_source != 'manual';"
    )
    rep["links"] += 1
for cid, (status, url, note) in contact_state.items():
    # A weaker verdict never overwrites support the address already has from another activity's link.
    guard = "" if status in ("verified", "likely") else f" AND NOT EXISTS (SELECT 1 FROM activity_contact_links l WHERE l.contact_id={q(cid)} AND l.status IN ('verified','likely'))"
    stmts.append(f"UPDATE outreach_contacts SET evidence_status={q(status)}, evidence_url={q(url)}, evidence_note={q(note)}, evidence_checked_at={NOW} WHERE id={q(cid)}{guard};")
    rep["contact_" + status] += 1
    if status in ("invalid", "conflict"):
        stmts.append(f"UPDATE outreach_contacts SET verification='uncertain' WHERE id={q(cid)} AND verification='checked' AND evidence_status IN ('invalid','conflict');")
        rep["contact_blocked_for_outreach"] += 1

PER = 400
n = 0
for i in range(0, len(stmts), PER):
    n += 1
    open(os.path.join(out_dir, f"{n:02d}.sql"), "w").write("\n".join(stmts[i:i + PER]))
rep["statements"] = len(stmts)
rep["files"] = n
json.dump(dict(rep), open(os.path.join(out_dir, "report.json"), "w"), indent=1)
print(json.dumps(dict(rep), indent=1))
