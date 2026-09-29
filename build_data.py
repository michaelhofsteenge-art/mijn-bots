#!/usr/bin/env python3
"""Bouw data.json voor de 'Mijn Bots' PWA.

Invoer:
  bots.json                         - vaste lijst bots (id, naam, emoji, kleur, subtitel)
  updates/<bot-key>/<ISO-datum>.md  - één bestand per update (de letterlijke tekst die
                                      de bot via SendToUser naar Mike stuurde).
      Bestandsnaam = tijdstip in Europe/Amsterdam, bv. 2026-09-28T09-04.md
      (':' mag niet in bestandsnamen, dus uren-minuten met '-').

Uitvoer:
  data.json  {generated_at, bots:[{id,name,emoji,color,subtitle,updates:[{date,markdown}]}]}
  Per bot de nieuwste update + max. 2 eerdere (instelbaar met --keep).

Gebruik:
  python3 build_data.py              # schrijft data.json
  python3 build_data.py --keep 3     # aantal updates per bot (standaard 3)
  python3 build_data.py --check      # alleen tonen wat er zou worden geschreven
"""
import argparse, json, re, sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Amsterdam")
ROOT = Path(__file__).resolve().parent
NAME_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:[T_ ](\d{2})[-:.]?(\d{2}))?")


def parse_stamp(p: Path) -> datetime:
    m = NAME_RE.match(p.stem)
    if not m:
        raise ValueError(f"Bestandsnaam zonder datum: {p} (verwacht bv. 2026-09-28T09-04.md)")
    d, hh, mm = m.group(1), m.group(2) or "00", m.group(3) or "00"
    return datetime.fromisoformat(f"{d}T{hh}:{mm}:00").replace(tzinfo=TZ)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", type=int, default=3)
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    bots = json.loads((ROOT / "bots.json").read_text(encoding="utf-8"))
    out = {"generated_at": datetime.now(TZ).isoformat(timespec="seconds"), "bots": []}
    for b in bots:
        folder = ROOT / "updates" / b["key"]
        if folder.is_dir():
            files = sorted(
                (f for f in folder.glob("*.md") if NAME_RE.match(f.stem)),
                key=parse_stamp,
                reverse=True,
            )
        else:
            files = []
        updates = []
        for f in files[: args.keep]:
            text = f.read_text(encoding="utf-8").strip()
            if text:
                updates.append({"date": parse_stamp(f).isoformat(timespec="minutes"), "markdown": text})
        out["bots"].append({k: b[k] for k in ("id", "name", "emoji", "color", "subtitle")} | {"updates": updates})
        print(f"{b['name']:34s} {len(updates)} update(s)" + (f", nieuwste {updates[0]['date']}" if updates else " -> 'Nog geen update beschikbaar'"))

    if args.check:
        return 0
    (ROOT / "data.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"data.json geschreven ({out['generated_at']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
