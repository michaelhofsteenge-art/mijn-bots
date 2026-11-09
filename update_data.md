# data.json dagelijks verversen

De app leest alleen `data.json`. Zo maak je een nieuwe versie:

## 1. Per bot de laatste berichten ophalen
Voor elk van de bots (zie `bots.json`):

| key | naam | agent id |
|---|---|---|
| statines | Statines en Gezondheid | 9a6d0150-5f98-4827-9e94-ec044c5b3054 |
| gv | Geestelijk Verzorger Vacatures | fc8435d8-909f-4dd4-ad98-401ee7160a81 |
| blockchain | Blockchain Update | 20f8c9d0-401e-4622-9ab1-5b4118baac32 |
| crypto | Crypto Adviseur | 49692e76-c77b-46ae-9328-2144b4d7eb96 |
| klimaat | Klimaat Kritisch | 80ec10c0-457b-46f7-b152-23e19cba262a |
| congres | Congres Trades | a0738999-573e-47b3-8b79-8d39798a19a8 |
| airesearch | AI | 571ba203-9b88-40a8-b5e6-2b215f8e0446 |
| covidkritisch | Covid kritisch | (bot-id onbekend; id in bots.json = `covidkritisch`) |

1. Lees het gesprek van de bot met de tool **ReadTranscript** (dynamische namespace `cursor`,
   argument `agent_id`, bv. `limit: 50`; schema eerst ophalen met `GetDynamicTools`).
2. Zoek de **SendToUser**-berichten van de bot aan Mike. Neem alleen inhoudelijke
   updates/rapporten (geen begroetingen, bevestigingen of tool-uitvoer).
3. Noteer het tijdstip in **Europe/Amsterdam** (tijden met `Z`/UTC eerst omrekenen, +2 u in de
   zomertijd, +1 u in de wintertijd).

Niets verzinnen: als er geen echte update is, maak geen bestand aan; de app toont dan
"Nog geen update beschikbaar".

## 2. Teksten opslaan
Sla elke update letterlijk op als markdown-bestand:
```
updates/<key>/<JJJJ-MM-DD>T<UU>-<MM>.md
bv. updates/crypto/2026-09-29T08-15.md
```
Oudere bestanden mogen blijven staan; het script neemt per bot automatisch de nieuwste 3.

Snelkoppeling voor de GV-bot: die schrijft zijn dagrapport ook naar
`/workspace/gv-vacatures-<datum>.md`. Kopiëren met het tijdstip van het bestand:
```
cd /workspace/bots-app
for f in /workspace/gv-vacatures-*.md; do
  cp "$f" "updates/gv/$(date -r "$f" +%Y-%m-%dT%H-%M).md"
done
```
(Controleer bij voorkeur in het transcript dat de inhoud overeenkomt met wat er via SendToUser
is gestuurd.)

## 3. data.json bouwen en controleren
```
cd /workspace/bots-app
python3 build_data.py --check   # overzicht, schrijft niets
python3 build_data.py           # schrijft data.json
python3 -m json.tool data.json > /dev/null && echo OK
```

## AI-weekupdate (`airesearch`)

De bot schrijft één weekrapport naar:

```
/workspace/ai-research/report-YYYY-MM-DD.md
```

`YYYY-MM-DD` is de **einddatum van de verslagperiode**, niet een los bewezen publicatie-uur. `publish.sh` kopieert dat bestand, op dezelfde manier als GV Research, naar `updates/airesearch/<datum>T<uu>-<mm>.md` en bouwt daarna `data.json`. De key is `airesearch` (map `updates/airesearch/`). Blockchain houdt de eigen key `blockchain`; die pipeline niet hergebruiken.

Zolang er nog geen bestand is, toont de app “Nog geen update beschikbaar”. Staat het rapport eenmaal in `data.json`, dan komt de bot vanzelf in de managementsamenvatting: de eerste alinea onder `## Samenvatting en conclusies`.

### Vaste vorm

```markdown
# AI — weekupdate <datum>

Periode: <begin> t/m <eind>. De titeldatum is de einddatum van de verslagperiode.

## Samenvatting en conclusies

<alinea>

**Conclusie:** <zin>

### <subkop, toegestaan>

## 1. Top 3 van de week
## 2. Nieuwe modellen en producten
## 3. Onderzoek en doorbraken
## 4. Geld en macht
## 5. Beleid en regelgeving
## 6. AI in de praktijk
## 7. Risico's en kritiek
## 8. Om in de gaten te houden
```

- Precies deze acht genummerde thema’s, in deze volgorde. Een thema zonder geverifieerd punt blijft staan, met een korte lege melding.
- `###` subkoppen zijn toegestaan, ook binnen de samenvatting.
- Bronnen zijn markdownlinks `[label](https://…)` of een kale `https://`-URL. Alleen bronnen die bij die editie horen; geen links uit een geschrapte conceptversie.
- Controle vóór opname: `python3 tests/check_ai_report.py <bestand>`.

### Eerste historische editie

`updates/airesearch/2026-11-01T00-00.md` is de gecontroleerde selectie voor **26 oktober t/m 1 november 2026** (week 44). Het tijdstip `00:00` betekent: alleen de periode-einddatum is vastgelegd, geen publicatieklok. Dit is geen rapport van 9 november. `publish.sh` is voor deze editie niet gedraaid.

## Covid kritisch (`covidkritisch`)

Tegel **Covid kritisch** (🧪) in App Onderzoek, los van de bestaande bot **Covid** (`covid`). Legenda: items met `keys: { covidkritisch: 1 }` in `legend.js` (bewijsklassen A–E, oordelen houdt stand / gedeeltelijk / houdt geen stand / open, bronlabels [P] [PR] [PP] [RET] [K] [S] [O] [?], T-codes en afkortingen), allemaal uit `onderzoeksopzet.md` en de leeswijzer van de nulmeting.

- **Nulmeting** (eerste editie): `updates/covidkritisch/2026-11-09T12-59.md`. App-versie van `/workspace/covidkritisch/nulmeting-2026-11-09.md` met dezelfde tekst; alleen koppen aangepast zodat elk thema een eigen onderwerpknop is (`## 0. Managementsamenvatting` → `## Samenvatting`, `### T1. …` → `## … (T1)`), plus `onderzoeksopzet.md` en `bronnen.md` als laatste twee onderwerpen.
- **Weekrapport** (elke maandag): de bot schrijft `/workspace/covidkritisch/report-JJJJ-MM-DD.md` en draait `./publish.sh` in `/workspace/bots-app`. Het script kopieert het naar `updates/covidkritisch/<datum>T<uu>-<mm>.md` (tijd = mtime van het bestand), bouwt `data.json`, commit en pusht. Geen sw.js-/`?v=`-bump nodig.
- **Vorm voor de app:** `# Covid kritisch — weekrapport <datum>` als titel; de managementsamenvatting onder de kop `## Samenvatting` (dan staat die bovenaan in het samenvattingsvak en in de managementsamenvatting van de app); daarna elk onderdeel als `## <n>. <titel>` (wordt een onderwerpknop), subkoppen met `###`. Bronlabels en klassen zoals in de nulmeting, dan verschijnt de legenda vanzelf.
- De app toont per bot de nieuwste 3 edities; na drie weekrapporten valt de nulmeting uit de app (bestand blijft in de repo).

## 4. Publiceren
`./publish.sh` bouwt `data.json`, commit en pusht naar `origin/main` (GitHub Pages).
Alleen `data.json` hoeft opnieuw geüpload/gecommit te worden bij nieuwe updates. De service
worker haalt `data.json` altijd eerst van het netwerk (cache-bust met `?t=` + `no-store`),
dus de iPhone ziet nieuwe updates bij openen, zichtbaar worden, ↻ / pull-to-refresh, of
elke ~60s op het startscherm. `sw.js` hoeft hiervoor niet aangepast te worden.

## Formaat data.json
```json
{
  "generated_at": "2026-09-28T15:30:00+02:00",
  "bots": [
    {"id": "…", "name": "…", "emoji": "💊", "color": "#E0457B", "subtitle": "…",
     "updates": [{"date": "2026-09-28T09:04+02:00", "markdown": "…"}]}
  ]
}
```
`updates[0]` is de nieuwste; lege `updates` = "Nog geen update beschikbaar".
