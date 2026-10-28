# Changelog - BitAxeTool

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

---

## [2.3.1] - 2026-10-28

### 📱 Mobile iOS UX & Freeze-Fix
- **Modal-Sheet-Layout mit fixierten Tabs & Actions:**
  - **Obere Reiter fest verankert:** Die Tabs (`Tuning`, `Pools`, `Lüfter & Display`) bleiben beim Scrollen immer oben fixiert und scrollen nicht mehr aus dem Sichtbereich heraus.
  - **Aktions-Buttons fest verankert:** "Löschen", "Abbrechen" und "Speichern" bleiben stets am unteren Bildschirmrand sichtbar und erreichbar – kein Scrollen mehr bis zum Seitenende nötig.
  - **Beseitigung von Scroll-Freezes auf iOS:** Entfernen von `touch-action: none` auf dem Body und Auflösung verschachtelter Scroll-Container in WebKit. Das Scrollen nach oben und unten friert nie mehr ein.
- **Kompaktere Schaltflächen & kleinere Schriftgröße:**
  - Deutlich reduzierte Schriftgrößen auf den Tabs (`0.68rem` / `0.62rem` mobil) und den Preset-Schnellvorlagen (`Eco`, `Ausgewogen`, `Power`), sodass alle Buttons auch auf schmalen Bildschirmen einzeilig und perfekt ins Raster passen.
  - Direkte Event-Bindung für Touch- und Klick-Events auf den oberen Buttons für sofortige Reaktionszeit ohne Verzögerung.
- **Element-Breiten & Responsivität optimiert:**
  - Maximale Modalbreite auf handliche `470px` (bzw. 100% minus Rand auf Smartphones) verkleinert.
  - Schnellvorlagen auf ein gleichmäßiges 3-Spalten-Grid umgestellt – kein Überlaufen oder Verzerren mehr.
- **PWA & Cache-Busting:**
  - Service Worker auf Network-First für HTML, CSS und JS umgestellt.
  - Automatisches Löschen veralteter PWA-Caches beim Update, sodass Layout-Fixes sofort auf Smartphones ankommen.

---

## [2.3.0] - 2026-10-28

### 🚀 Highlights & Neuerungen
- **Vollständige Miner-Optionen & Stratum-Pool-Setup:**
  - **Primärer Mining-Pool:** Konfiguration von Pool-URL, Stratum-Port, Worker / Bitcoin-Auszahlungsadresse, Passwort und vorgeschlagener Difficulty direkt in der App.
  - **Fallback-Mining-Pool:** Vollständige Konfiguration des Ausfall-Pools (URL, Port, Worker, Passwort, Difficulty) zur Maximierung der Verfügbarkeit.
  - **Hardware-, Lüfter- & Display-Optionen:** Konfiguration von Miner-Hostname, automatischer vs. manueller Lüfterdrehzahl, Mindestdrehzahl, 180°-Display-Invertierung und Bildschirm-Timeout.
  - **Live-Synchronisation mit AxeOS:** Alle Einstellungen werden direkt über die native AxeOS REST-API (`PATCH /api/system`) an die Miner übertragen.

- **Einstellungen synchron auf alle Miner derselben Art übernehmen:**
  - Neue Broadcast-Funktion: Mit nur einem Klick können Tuning-, Pool- und Hardware-Parameter synchron auf alle erkannten Miner desselben Modells (z. B. alle BM1370 / Bitaxe Gamma 601) angewendet werden.

- **Behebung von Scroll-Problemen & Hängern (Freeze Fix auf iOS):**
  - **Z-Index-Hierarchie korrigiert:** Modale Dialoge liegen nun mit `z-index: 100000` sicher über dem schwebenden Bottom Dock (`z-index: 9999`), sodass Buttons ("Löschen", "Abbrechen", "Speichern") jederzeit uneingeschränkt sichtbar und bedienbar sind.
  - **Scroll-Containment (`overscroll-behavior: contain`):** Verhindert das Chaining von Scrollgesten auf den Hintergrund und beseitigt das Einfrieren von Safari/WebKit am Scroll-Ende.
  - **Body-Scroll-Lock:** Sperrt Hintergrund-Scrolling sauber während geöffnete Dialoge aktiv sind.

- **Formular-Breite & Responsive-Design:**
  - `minmax(0, 1fr)` und `min-width: 0` auf allen Grid-Spalten und Eingabefeldern verhindern jegliches horizontales Abschneiden von Feldern oder Beschriftungen auf Smartphone-Displays.
  - Segmentierte Reiter-Navigation (`Tuning & Thermik`, `Mining-Pools`, `Lüfter & Display`) sorgt für extrem kompakte, übersichtliche Dialoge ohne endloses Scrollen.

---

## [2.2.0] - 2026-10-27

### 🚀 Highlights & Neuerungen
- **Changelog, CC-Lizenz & Urheberrecht direkt in den Einstellungen:**
  - **Einstellungsmenü (Settings):** Vollständige Integration von Changelog, Lizenzbedingungen und Urheberrechtsangaben im Hauptmenü.
  - **Autor & Webseite:** Offizieller Copyright-Vermerk von `mrgoldsmitt` mit direkter Verlinkung zur Homepage [mrgoldsmitt.work](https://mrgoldsmitt.work).
  - **Creative Commons Lizenz (CC BY-NC 4.0):** Vollständige Einbindung der Creative Commons Attribution-NonCommercial 4.0 International Lizenz (sowohl als verständliche Übersicht als auch als vollständiger Rechtstext).
  - **Reiter-Navigation:** Das Informationsfenster bietet nun drei übersichtliche Tabs: *Changelog*, *CC-Lizenz (CC BY-NC 4.0)* und *Über das Projekt & Autor*.
  - **Ausfallsichere API:** Die Endpunkte `/api/changelog` und `/api/license` ermitteln Pfade nun dynamisch über Entwicklungs-, Release- und PyInstaller-Umgebungen hinweg und besitzen integrierte Fallbacks, damit Dokumentationen niemals leer bleiben.

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
