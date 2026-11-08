#!/usr/bin/env python3
"""Controleer de vaste vorm van een AI-weekupdate. Geen inhoudelijke broncontrole."""
import re
import sys
from pathlib import Path

THEMES = [
    "Top 3 van de week",
    "Nieuwe modellen en producten",
    "Onderzoek en doorbraken",
    "Geld en macht",
    "Beleid en regelgeving",
    "AI in de praktijk",
    "Risico's en kritiek",
    "Om in de gaten te houden",
]
# Aggregators uit de geschrapte conceptversie. Geen primaire bron voor deze rubriek.
DRAFT_HOSTS = ("aidaily.si", "aimap.page", "atlas.prashish.com")
H1 = re.compile(r"^# AI — weekupdate \S")
THEME = re.compile(r"^## ([1-8])\. (.+?)\s*$")


def check(text: str, name: str = "") -> list[str]:
    errors = []
    lines = text.replace("\r\n", "\n").split("\n")
    heads = [(i, ln) for i, ln in enumerate(lines) if ln.startswith("#")]
    h1 = [ln for _, ln in heads if ln.startswith("# ") and not ln.startswith("## ")]
    if len(h1) != 1 or not H1.match(h1[0]):
        errors.append("titel moet één regel zijn: # AI — weekupdate <datum> (met —)")
    summary_at = next((i for i, ln in enumerate(lines) if ln.strip() == "## Samenvatting en conclusies"), None)
    if summary_at is None:
        errors.append("mist ## Samenvatting en conclusies")
    elif any(ln.startswith("## ") and not ln.startswith("### ") and i < summary_at for i, ln in enumerate(lines)):
        errors.append("samenvatting moet de eerste ##-kop zijn")
    themes = []
    for ln in lines:
        m = THEME.match(ln)
        if m:
            themes.append((int(m.group(1)), m.group(2)))
        elif re.match(r"^## \d+\. ", ln):
            errors.append(f"themakop buiten 1–8: {ln}")
    expect = list(enumerate(THEMES, start=1))
    if themes != expect:
        errors.append(f"thema's moeten exact 1–8 zijn, kreeg: {themes}")
    if "### " not in text and name.endswith("2026-11-01T00-00.md"):
        errors.append("de historische editie heeft een ###-subkop in de samenvatting")
    low = text.lower()
    for host in DRAFT_HOSTS:
        if host in low:
            errors.append(f"geschrapte conceptbron nog aanwezig: {host}")
    if "2026-11-01" in name:
        required = (
            "https://help.openai.com/en/articles/9624314-model-release-notes",
            "https://www.anthropic.com/news/s1-sec",
            "https://investor.atmeta.com/investor-news/press-release-details/2026/",
            "https://openai.com/index/building-scientific-understanding-with-academic-communities/",
            "https://cohere.com/blog/concerning-behaviour-popular-open-weight-ai-model",
            "https://openai.com/index/introducing-gpt-6-1-terra",
        )
        for url in required:
            if url not in text:
                errors.append(f"primaire URL ontbreekt: {url}")
        for banned in ("Gemini", "Genie", "Mistral", "SpaceX", "aidaily", "AIMap"):
            if banned.lower() in low:
                errors.append(f"conceptclaim-marker nog aanwezig: {banned}")
    return errors


def main() -> int:
    if len(sys.argv) != 2:
        print("gebruik: python3 tests/check_ai_report.py <rapport.md>", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    errors = check(path.read_text(encoding="utf-8"), path.name)
    if errors:
        print(f"{path}: NIET in orde")
        for err in errors:
            print(f"- {err}")
        return 1
    print(f"{path}: vorm in orde (8 thema's, samenvatting, geen conceptbronnen)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
