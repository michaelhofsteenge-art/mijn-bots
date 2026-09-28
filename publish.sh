#!/usr/bin/env bash
# Ververs data.json en zet wijzigingen op GitHub Pages.
set -euo pipefail
cd /workspace/bots-app
# GV-bot schrijft zijn dagrapport naar /workspace/gv-vacatures-<datum>.md
for f in /workspace/gv-vacatures-*.md; do
  [ -e "$f" ] || continue
  d=$(date -r "$f" +%Y-%m-%dT%H-%M)
  day=${d%%T*}
  # sla over als er voor die dag al een gv-bestand is met dezelfde inhoud
  if ! ls updates/gv/${day}T*.md >/dev/null 2>&1 || ! cmp -s "$f" "updates/gv/$d.md" 2>/dev/null && [ ! -e "updates/gv/$d.md" ]; then
    cp "$f" "updates/gv/$d.md"
  fi
done
python3 build_data.py >/dev/null
python3 -m json.tool data.json >/dev/null
git add -A
if git diff --cached --quiet; then echo "Geen wijzigingen"; exit 0; fi
git commit -qm "Updates $(date +%Y-%m-%d\ %H:%M)"
git push -q origin main
echo "Gepubliceerd: $(git log -1 --oneline)"
