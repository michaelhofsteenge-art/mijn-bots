# Mijn Bots — PWA voor iPhone

Eén app met grote knoppen, één per Grok Bot-assistent. Tik op een knop om de laatste update
van die bot te lezen (plus max. 2 eerdere updates). Interface in het Nederlands, licht/donker
volgt de iPhone-instelling, veilige marges voor notch/home-indicator. Werkt als normale tab
in Chrome én Safari; voor een beginscherm-icoon is Safari (“Zet op beginscherm”) het best.

Live: https://michaelhofsteenge-art.github.io/mijn-bots/

## Bestanden
| Bestand | Doel |
|---|---|
| `index.html` | App-shell (PIN-scherm, startscherm, detailscherm) + iOS/Chrome meta-tags |
| `app.js` | Logica: PIN, laden van `data.json`, weergave, offline-fallback, crypto-trades |
| `md.js` | Mini markdown-renderer (geen CDN, geen externe library) |
| `style.css` | Opmaak, dark/light mode, safe-area insets |
| `config.js` | Standaard PIN-hash en instellingen (fallback bij eerste gebruik) |
| `sw.js` | Service worker: app-bestanden cache-first, `data.json` network-first met offline-fallback |
| `manifest.webmanifest` | PWA-manifest |
| `icons/` | `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `favicon-32.png` |
| `data.json` | De updates (wordt gegenereerd) |
| `bots.json` | Vaste lijst van de bots (id, naam, emoji, kleur, subtitel) |
| `updates/<bot>/<datum>.md` | Bronteksten per update |
| `build_data.py` | Bouwt `data.json` uit `bots.json` + `updates/` |
| `make_icons.py` | Genereert de iconen opnieuw (Pillow, zit in `.venv`) |
| `update_data.md` | Stappenplan om de data dagelijks te verversen |
| `publish.sh` | Bouwt data.json, commit en push naar GitHub Pages |

## PIN
Standaard (eerste gebruik): **1234**. Na ontgrendelen: ⚙️ **Pincode wijzigen** in de footer.
De nieuwe PIN-hash staat alleen in `localStorage` op het toestel (`mijnbots-pin-hash`),
niet remote. Ontbreekt die, dan geldt `PIN_SHA256` in `config.js`.

Om de standaard-hash in `config.js` te zetten:
```
echo -n 4821 | sha256sum
```
Verhoog daarna `CONFIG_VERSION` zodat het toestel opnieuw om de PIN vraagt.

> **Let op: dit is lichte bescherming.** De PIN-controle gebeurt in de browser; de standaard-
> hash staat in een openbaar bestand en `data.json` is gewoon op te vragen door wie de URL
> kent. Een 4-cijferige PIN is met 10.000 pogingen te kraken. Het houdt nieuwsgierige
> meekijkers tegen, maar zet er geen echt gevoelige informatie in.

## Lokaal testen
```
cd /workspace/bots-app && python3 -m http.server 8765
# open http://localhost:8765/
```

## Na wijzigingen aan HTML/JS/CSS/iconen
Verhoog `VERSION` in `sw.js` (bv. `v2` → `v3`), anders blijft de iPhone de oude app-bestanden
uit de cache tonen. Voor alleen een nieuwe `data.json` is dat níet nodig (network-first).
Daarna: `./publish.sh` (of commit + push naar `main`).

## Gebruik op de iPhone
- **Chrome-tab:** open de URL gewoon; alles werkt (PIN, updates, pull-to-refresh / ↻).
- **Beginscherm-icoon:** open in **Safari** → Deel → **Zet op beginscherm** → Voeg toe.
