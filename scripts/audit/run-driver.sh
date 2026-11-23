#!/bin/bash
# Apply loop of the catalogue research pipeline: every 90 s, validate (machine-check the quotes) and apply
# the new agent outputs in <scratch>/research/out to production, once per batch.
#
#   nohup bash scripts/audit/run-driver.sh <scratch_root> > /dev/null 2>&1 &
#
# <scratch_root> holds research/{in,out,validated,applied.txt}, local.db, analysis/, crawl/evidence.jsonl
# (all rebuildable, see docs/audit-pipeline.md). A container restart kills this loop: start it again.
# In a cloud session CLOUDFLARE_API_TOKEN may be a placeholder: the proxy injects the real credential.
cd "$(dirname "$0")/../.." || exit 1
S="${1:?usage: run-driver.sh <scratch_root>}"
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-proxy-injected}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-4f67735f4c54821e8bce8010bca04c42}"
while true; do
  out=$(python3 -I scripts/audit/process-new.py "$S/research" "$S/local.db" "$S/analysis" "$S/crawl/evidence.jsonl" 2>&1 | tail -4)
  if ! echo "$out" | grep -q "nothing new"; then echo "$(date -u +%H:%M) $out" >> "$S/driver.log"; fi
  sleep 90
done
