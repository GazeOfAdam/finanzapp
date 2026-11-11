# FlowPilot Partner A (PWA)

Offlinefähige Progressive Web App (PWA) zur Budget-, Cashflow-, Trinkgeld-Waterfall- und Pflichtausgaben-Steuerung für ein Android-Smartphone (Google Pixel).

---

## 📲 Installation auf dem Smartphone via GitHub Pages

1. **GitHub Pages im Repository aktivieren (einmalig):**
   - Öffne **[Settings → Pages](https://github.com/GazeOfAdam/finanzapp/settings/pages)** in diesem Repository.
   - Wähle unter **Build and deployment → Source** entweder:
     - **GitHub Actions** *(automatischer Workflow `.github/workflows/deploy-pages.yml` ist bereits eingerichtet)*, **oder**
     - **Deploy from a branch** → Branch **`gh-pages`** (`/ (root)`) bzw. Branch **`main`** (`/docs`).
2. **Auf dem Google Pixel / Android-Smartphone installieren:**
   - Öffne in **Google Chrome** die URL:
     👉 **https://gazeofadam.github.io/finanzapp/**
   - Tippe oben rechts in der App-Leiste auf den Button **„Installieren“** *(oder im Chrome-Menü `⋮` auf **„App installieren“** / **„Zum Startbildschirm hinzufügen“**)*.
   - Die App wird als natives **Android WebAPK** mit eigenem Icon auf deinem Startbildschirm installiert, läuft im Vollbildmodus (`standalone`) und funktioniert dank Workbox Service Worker **vollständig offline**.

---

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

---

## Lokale Entwicklung & Tests

```bash
git clone https://github.com/GazeOfAdam/finanzapp.git
cd finanzapp
npm install
npm test          # Führt die Vitest-Suite inkl. 100-Sequenzen Property-Test aus
npm run dev       # Startet den lokalen Entwicklungsserver
npm run build     # Erstellt das produktionsreife PWA-Bundle unter dist/
```