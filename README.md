# MLStats

Browser-Extension (Chrome, Edge, Brave, Opera – Manifest V3) für app.musicleague.com.
Zeigt pro Person: wie viele Punkte/Stimmen sie dir gegeben hat und wie viele du ihr gegeben hast.

## Installation
1. `chrome://extensions` bzw. `edge://extensions` öffnen
2. „Entwicklermodus" aktivieren
3. „Entpackte Erweiterung laden" → diesen Ordner wählen

## Nutzung
1. Auf app.musicleague.com einloggen und eine League öffnen
2. Extension-Icon → „League analysieren"
3. Bei „Ich bin" den eigenen Namen wählen; Spaltenköpfe sortieren

## Wenn nichts gefunden wird
`scraper.js` lädt `/l/<league>/-/rounds` (Rundenliste) und `/l/<league>/<round>/-/results` (Ergebnisse)
und liest die Bootstrap-Karten aus. Ändert Music League das Markup, „Debug-HTML" speichern und
`parseRounds` / `parseResults` anpassen.
