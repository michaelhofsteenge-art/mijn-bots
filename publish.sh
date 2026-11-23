#!/usr/bin/env bash
# Ververs data.json en zet wijzigingen op GitHub Pages.
set -euo pipefail
cd /workspace/bots-app
# GV-bot schrijft zijn dagrapport naar /workspace/gv-vacatures-<datum>.md
# De datum komt uit de bestandsnaam (niet uit de mtime: die kan voor oude bestanden
# gelijk worden gezet, zoals op 16-11). Een al gepubliceerd rapport blijft staan,
# tenzij de GV-bot het op die dag zelf heeft herschreven (mtime-dag = rapportdag).
for f in /workspace/gv-vacatures-20[0-9][0-9]-[0-9][0-9]-[0-9][0-9].md; do
  [ -e "$f" ] || continue
  day=$(basename "$f" .md); day=${day#gv-vacatures-}
  mday=$(date -r "$f" +%Y-%m-%d)
  old=$(ls updates/gv/"$day"T*.md 2>/dev/null | tail -n 1 || true)
  if [ -n "$old" ]; then
    cmp -s "$f" "$old" && continue
    [ "$mday" = "$day" ] && [ "$f" -nt "$old" ] || continue
  fi
  if [ "$mday" = "$day" ]; then d="${day}T$(date -r "$f" +%H-%M)"; else d="${day}T09-00"; fi
  rm -f updates/gv/"$day"T*.md
  cp -p "$f" "updates/gv/$d.md"
done
# Parkinson-, Covid-, Covid kritisch-, GV-research-, AI- en Klimaatcritici-bot schrijven wekelijks report-<datum>.md
# AI: /workspace/ai-research  ·  GV Research: /workspace/gv-research  ·  overige: /workspace/<key>
for key in parkinson covid covidkritisch gvresearch airesearch klimaatcritici; do
  mkdir -p updates/$key
  src=/workspace/$key
  [ "$key" = gvresearch ] && src=/workspace/gv-research
  [ "$key" = airesearch ] && src=/workspace/ai-research
  for f in $src/report-*.md; do
    [ -e "$f" ] || continue
    d=$(basename "$f" .md); d=${d#report-}
    ls updates/$key/"$d"*.md >/dev/null 2>&1 && cmp -s "$f" updates/$key/"$d"*.md && continue
    rm -f updates/$key/"$d"*.md
    cp "$f" "updates/$key/${d}T$(date -r "$f" +%H-%M).md"
  done
done
# Quantum Computing research (new) schrijft /workspace/Quantum-<soort>-<datum>.md
# (scorecard en compleet-bundel overslaan; oude bot /workspace/quantum-updates niet meer gebruiken)
mkdir -p updates/quantum
for f in /workspace/Quantum-*-20[0-9][0-9]-[0-9][0-9]-[0-9][0-9].md; do
  [ -e "$f" ] || continue
  case "$(basename "$f")" in Quantum-scorecard-*) continue;; esac
  d=$(basename "$f" .md); d=${d: -10}
  tmp=$(mktemp); cp "$f" "$tmp"
  # nulmeting: scorecard van dezelfde datum als extra sub-knop toevoegen
  sc=/workspace/Quantum-scorecard-$d.md
  if [ -e "$sc" ]; then
    n=$(grep -c '^## ' "$f" || true)
    { printf '\n\n## %s. Scorecard nulmeting (20 bedrijven)\n\n' "$n"; tail -n +2 "$sc"; } >> "$tmp"
  fi
  ls updates/quantum/"$d"*.md >/dev/null 2>&1 && cmp -s "$tmp" updates/quantum/"$d"*.md && { rm -f "$tmp"; continue; }
  rm -f updates/quantum/"$d"*.md
  mv "$tmp" "updates/quantum/${d}T$(date -r "$f" +%H-%M).md"
done
python3 build_data.py >/dev/null
python3 -m json.tool data.json >/dev/null
git add -A
if git diff --cached --quiet; then echo "Geen wijzigingen"; exit 0; fi
git commit -qm "Updates $(date +%Y-%m-%d\ %H:%M)"
git push -q origin main
echo "Gepubliceerd: $(git log -1 --oneline)"
