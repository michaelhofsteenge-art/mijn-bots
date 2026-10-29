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
for key in parkinson covid gvresearch; do
  mkdir -p updates/$key
  src=/workspace/$key; [ "$key" = gvresearch ] && src=/workspace/gv-research
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
