# Changelog - BitAxeTool

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

---

## [2.1.0] - 2026-10-27

### 🚀 Highlights & Neuerungen
- **24-Stunden-Verlaufsdiagramme als Popup:**
  - Durch Klick auf eine der 6 KPI-Karten im oberen Bereich öffnet sich ein interaktives Liquid-Glass-Diagramm mit dem 24h-Verlauf der jeweiligen Metrik (Hashrate, Leistung, ASIC-Temperatur, VRM-Temperatur, Effizienz oder Miner-Anzahl).
  - Zeitbereich umschaltbar zwischen `1 Std`, `6 Std` und `24 Std`.
  - Direkte Anzeige von aktuellen Werten sowie Minimum, Durchschnitt und Maximum über den gewählten Zeitraum.

- **Optimierte Miner-Kartenbreite & Best-Difficulty-Integration:**
  - Die Miner-Karten passen sich nun 100% responsive und ohne horizontales Überlaufen an mobile Bildschirme an.
  - Die separate "Best Difficulty"-Karte wurde entfernt; die Bestwerte (`All-Time` und `Session / Boot`) sind jetzt direkt mit goldenem Stern auf jeder Miner-Statuskarte integriert.

- **Dauerhaft fixierte Menüleiste (iOS Bottom Dock):**
  - Das schwebende Liquid-Glass-Dock bleibt beim Scrollen fest am unteren Bildschirmrand verankert (`translateZ(0)` Hardwarebeschleunigung).
  - Vertikales Icon-Layout verhindert jegliches Überlaufen auf schmalen Smartphone-Displays.
- **iOS Liquid Glass Design & Farben nach Referenzvorlage:**
  - Komplettes Redesign der Benutzeroberfläche im authentischen **iOS Liquid Glass Stil**: Tiefer OLED-Schwarz-Hintergrund (`#000000`), satinierte Frosted-Glass-Karten (`backdrop-filter: blur(28px)`), dezente Lichtkanten und abgerundete Ecken (`20px`).
  - **Präzise 6-Karten-Metrikleiste** mit originalen Apple-Neon-Akzentfarben:
    - *Total Hash Rate:* Electric Cyan `#2997ff` Blitz-Icon
    - *Total Power:* Orange `#ff9500` Power-Icon
    - *Avg ASIC Temp:* Coral-Red `#ff453a` Thermometer-Icon
    - *Avg VR Temp:* Amber-Orange `#ff9f0a` VR-Thermometer-Icon
    - *Avg Efficiency:* Magenta/Purple `#bf5af2` Tachometer-Icon
    - *Online Miners:* Neon-Grün `#30d158` Chip-Icon
  - **"Best Difficulty" Karte:**
    - Live-Erfassung und Formatierung der Bestwerte (`All Time Best` & `Since System Boot`, z.B. `25.02 G` und `1.20 G`).
    - Goldener Stern (`#ffd60a`) und Miner-Verlinkung in Neon-Blau.
    - Interaktive Karussell-Paginierung zum Umschalten zwischen mehreren Minern.
  - **Miners Status Header mit Live-Zeitanzeige:**
    - Präziser relativer Aktualisierungs-Timer (*"Updated just now"* / *"Updated X secs ago"*).

- **Prominenter Glockenbutton für Benachrichtigungen & Alarme:**
  - **Header-Glocke:** Unübersehbarer kreisrunder Frosted-Glass-Button mit Alarm-Statuspunkt im oberen Header.
  - **Floating iOS Dock Tab:** Eigener fester "Alarm"-Tab in der schwebenden unteren Liquid-Glass-Navigationsleiste für direkten Zugriff auf dem Smartphone.
  - **Alarm-Ereignisse konfigurierbar:** Überhitzungsschutz, VRM-Temperaturwarnung, Offline-Erkennung, Watchdog-Reboot, Tuning-Fortschritt und Sound/Vibration.

- **Vollständiges SVG-Icon-System (Keine Emojis):**
  - Alle bisherigen Raster- und Emoji-Grafiken durch messerscharfe, skalierbare und responsive Inline-SVG-Vektorgrafiken ersetzt.

- **Progressive Web App (PWA) & Smartphone-App:**
  - Vollständige PWA-Unterstützung mit `manifest.json` und Service Worker (`sw.js`).
  - Hochauflösendes App-Iconset (192x192, 512x512, maskable für Android und `apple-touch-icon` für iOS Safari).
  - Direkt auf iPhone, iPad und Android-Smartphones als eigenständige Vollbild-App ohne Browserleiste installierbar.
  - Offline-Shell-Caching für blitzschnellen Start auf mobilen Geräten.

- **Nativer Windows-Betrieb ohne Terminal:**
  - Vollständige Kompilierung als eigenständige Windows-Anwendung (`BitAxeTool.exe`) mittels PyInstaller mit `--windowed` Flag (kein störendes schwarzes Konsolenfenster).
  - Modernes, rahmenloses WebView2-Desktop-Fenster mit nativem Windows-Icon.
  - Alternativer No-Console-Starter (`Start_BitAxeTool.vbs`) für portable Nutzung.

- **Intelligente Port-Verwaltung (Konfliktfrei):**
  - Standardport von `8080` auf den reservierten Port `21420` geändert, um Überschneidungen mit anderen Programmen vollständig zu verhindern.
  - Dynamischer Port-Fallback (`find_available_port`): Erkennt automatisch, falls ein Port belegt ist, und weicht unterbrechungsfrei auf den nächsten freien Port aus.

- **Überarbeitetes Autotuning & Thermische Regelung:**
  - **Symmetrisches Deadband:** Das Zieltemperatur-Band wurde von einem einseitigen harten Deckel auf ein stabiles Band umgestellt (`target_temp ± temp_tolerance`, z.B. 60°C - 64°C bei 62°C Sollwert).
  - **Thermische Reserven voll nutzbar:** Realistische und sichere Standardwerte hinterlegt (Sollwert 62°C, Notdrosselung erst bei 70°C, Power-Limit für BM1370 auf 26W angehoben).
  - **Erweiterte Frequenzleiter:** Bis 950 MHz freigegeben, sodass BM1370-Miner ihre volle Rechenleistung (über 1,35+ TH/s) entfalten können.
  - **Flatline-Watchdog korrigiert:** Der Watchdog rebootet nur noch bei echtem Freeze (0 GH/s über mehrere Zyklen), niemals mehr bei konstant gesunder Hashrate.
