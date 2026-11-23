#!/usr/bin/env python3
"""Progress of the research queue:  python3 -I scripts/audit/status.py <scratch>

Reads <scratch>/research/{in,out} (and <scratch>/next.json, the launch pointers kept by hand while launching agents:
{"kept_next":N,"kept_last":N,"haiku_next":N,"haiku_last":N}). Batches below the pointers that still have no output file
are the ones whose agent is running or died on a usage limit.
"""
import json, os, re, sys

S = sys.argv[1]
R = os.path.join(S, "research")


def nums(d, pat):
    return sorted(int(m.group(1)) for f in os.listdir(os.path.join(R, d)) if (m := re.fullmatch(pat, f)))


ins = nums("in", r"batch-(\d+)\.in\.json")
outs = set(nums("out", r"batch-(\d+)\.json"))
done = [n for n in ins if n in outs]
todo = [n for n in ins if n not in outs]
acts = sum(len(json.load(open(f"{R}/in/batch-{n}.in.json"))["activities"]) for n in todo)
print(f"batches: {len(done)} done / {len(todo)} open ({acts} activities open)")
try:
    nx = json.load(open(os.path.join(S, "next.json")))
except FileNotFoundError:
    sys.exit("no next.json (launch pointers) in the scratch directory")
print(f"next owner-kept batch {nx['kept_next']} (up to {nx['kept_last']}); next cheap-model batch {nx['haiku_next']} (up to {nx['haiku_last']})")
started = [n for n in todo if n < nx["kept_next"] or nx["kept_last"] < n < nx["haiku_next"]]
print("started, no output yet:", started)
