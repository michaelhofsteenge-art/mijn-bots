#!/usr/bin/env bash
# Ververs data.json en zet wijzigingen op GitHub Pages.
set -euo pipefail
cd /workspace/bots-app
# GV-bot schrijft zijn dagrapport naar /workspace/gv-vacatures-<datum>.md
for f in /workspace/gv-vacatures-*.md; do
  [ -e "$f" ] || continue
  d=$(date -r "$f" +%Y-%m-%dT%H-%M)
  [ -e "updates/gv/$d.md" ] && continue
  # één GV-rapport per dag: vervang een oudere versie van dezelfde dag
  rm -f updates/gv/"${d%%T*}"T*.md
  cp "$f" "updates/gv/$d.md"
done
python3 build_data.py >/dev/null
python3 -m json.tool data.json >/dev/null
git add -A
if git diff --cached --quiet; then echo "Geen wijzigingen"; exit 0; fi
git commit -qm "Updates $(date +%Y-%m-%d\ %H:%M)"
git push -q origin main
echo "Gepubliceerd: $(git log -1 --oneline)"
