# FlowPilot Partner A (PWA)

Offlinefähige Progressive Web App (PWA) zur Budget-, Cashflow-, Trinkgeld-Waterfall- und Pflichtausgaben-Steuerung für ein Android-Smartphone (Google Pixel).

## Features & Systemvertrag

- **Zero-Cloud & Privacy:** 100 % `localStorage`, keine externen Server/APIs.
- **Reine Cent-Arithmetik:** Alle Finanzberechnungen erfolgen deterministisch in ganzzahligen Cent (`number` / Integer).
- **Entflechtete 5-Stufen-Pflichtlast:**
  1. `NettoWohnen = MAX(0, Warmmiete - Wohngeld) + Nebenkosten` (Default Wohngeld: `47.000 Cent`)
  2. `NettoAlltag = MAX(0, Σ(Alltagsbudgets) - Kindergeld)` (Default Kindergeld: `25.900 Cent`)
  3. `GemeinsameRuecklagen = Σ(SinkingFunds)` (ING Tagesgeld)
  4. `GemeinschaftsanteilA = Math.round((NettoWohnen + NettoAlltag + GemeinsameRuecklagen) * 0.5)`
  5. `PrivatePflichtA = Σ(AktivePrivateDarlehensraten) + Σ(PrivateAbos) + Σ(ImMonatFaelligePayIn30)`
- **Trinkgeld-Waterfall & System-Invarianten:**
  - **Invariante 1:** `Erfasstes Trinkgeld = Reserviertes Bargeld + Freies Taschengeld + Privatausgaben + Eingezahltes Bargeld`
  - **Invariante 2:** `VerfuegbarerPuffer = 2 × FreiesTaschengeld`

## Lokale Ausführung

```bash
git clone https://github.com/GazeOfAdam/finanzapp.git
cd finanzapp
npm install
npm test          # Führt die Vitest-Suite inkl. 100-Sequenzen Property-Test aus
npm run dev       # Startet den lokalen Entwicklungsserver
npm run build     # Erstellt das produktionsreife PWA-Bundle unter dist/
```