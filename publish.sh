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
# Parkinson- en Covid-bot schrijven wekelijks /workspace/<key>/report-<datum>.md
for key in parkinson covid; do
  mkdir -p updates/$key
  for f in /workspace/$key/report-*.md; do
    [ -e "$f" ] || continue
    d=$(basename "$f" .md); d=${d#report-}
    ls updates/$key/"$d"*.md >/dev/null 2>&1 && cmp -s "$f" updates/$key/"$d"*.md && continue
    rm -f updates/$key/"$d"*.md
    cp "$f" "updates/$key/${d}T$(date -r "$f" +%H-%M).md"
  done
done
# Quantum-bot schrijft wekelijks /workspace/quantum-updates/<datum>.md
mkdir -p updates/quantum
for f in /workspace/quantum-updates/*.md; do
  [ -e "$f" ] || continue
  d=$(basename "$f" .md)
  ls updates/quantum/"$d"*.md >/dev/null 2>&1 && cmp -s "$f" updates/quantum/"$d"*.md && continue
  rm -f updates/quantum/"$d"*.md
  cp "$f" "updates/quantum/${d}T$(date -r "$f" +%H-%M).md"
done
python3 build_data.py >/dev/null
python3 -m json.tool data.json >/dev/null
git add -A
if git diff --cached --quiet; then echo "Geen wijzigingen"; exit 0; fi
git commit -qm "Updates $(date +%Y-%m-%d\ %H:%M)"
git push -q origin main
echo "Gepubliceerd: $(git log -1 --oneline)"
