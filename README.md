# Mijn Bots — PWA voor iPhone

Eén app met grote knoppen, één per Grok Bot-assistent. Tik op een knop om de laatste update
van die bot te lezen (plus max. 2 eerdere updates). Interface in het Nederlands, licht/donker
volgt de iPhone-instelling, veilige marges voor de notch.

## Bestanden
| Bestand | Doel |
|---|---|
| `index.html` | App-shell (PIN-scherm, startscherm, detailscherm) + iOS meta-tags |
| `app.js` | Logica: PIN, laden van `data.json`, weergave, offline-fallback |
| `md.js` | Mini markdown-renderer (geen CDN, geen externe library) |
| `style.css` | Opmaak, dark/light mode, safe-area insets |
| `config.js` | **PIN-hash en instellingen — de enige plek om de PIN te wijzigen** |
| `sw.js` | Service worker: app-bestanden cache-first, `data.json` network-first met offline-fallback |
| `manifest.webmanifest` | PWA-manifest |
| `icons/` | `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `favicon-32.png` |
| `data.json` | De updates (wordt gegenereerd) |
| `bots.json` | Vaste lijst van de 5 bots (id, naam, emoji, kleur, subtitel) |
| `updates/<bot>/<datum>.md` | Bronteksten per update |
| `build_data.py` | Bouwt `data.json` uit `bots.json` + `updates/` |
| `make_icons.py` | Genereert de iconen opnieuw (Pillow, zit in `.venv`) |
| `update_data.md` | Stappenplan om de data dagelijks te verversen |

## PIN wijzigen (tijdelijke PIN: 1234)
Open `config.js` en vervang `PIN_SHA256` door de hash van de nieuwe PIN:
```
echo -n 4821 | sha256sum
```
Verhoog daarna `CONFIG_VERSION` zodat het toestel opnieuw om de PIN vraagt.

> **Let op: dit is lichte bescherming.** De PIN-controle gebeurt in de browser; de hash staat
> in een openbaar bestand en `data.json` is gewoon op te vragen door wie de URL kent. Een
> 4-cijferige PIN is met 10.000 pogingen te kraken. Het houdt nieuwsgierige meekijkers tegen,
> maar zet er geen echt gevoelige informatie in. Op GitHub Pages (publiek) is alles leesbaar.

## Lokaal testen
```
cd /workspace/bots-app && python3 -m http.server 8765
# open http://localhost:8765/
```

## Na wijzigingen aan HTML/JS/CSS/iconen
Verhoog `VERSION` in `sw.js` (bv. `v2`), anders blijft de iPhone de oude app-bestanden uit de
cache tonen. Voor alleen een nieuwe `data.json` is dat níet nodig (network-first).

## Installeren op de iPhone (na hosting op GitHub Pages)
1. Open de URL in **Safari** (niet Chrome).
2. Deel-knop → **Zet op beginscherm** → Voeg toe.
3. Open "Mijn Bots" vanaf het beginscherm en voer de PIN in.

## Hosting (later)
Nog niet gepubliceerd. Alle paden zijn relatief, dus het werkt ook onder
`https://<gebruiker>.github.io/<repo>/`. Upload de map zonder `.venv/`, `__pycache__/`
(en eventueel zonder `updates/`, `build_data.py`, `make_icons.py`).
