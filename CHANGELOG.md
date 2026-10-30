# Changelog - BitAxeTool

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

---

## [2.3.8] - 2026-10-31

### 🔧 Fix: Zuverlässiges Speichern von Watt- und Takt-Grenzen & Aktives Overclocking
- **HTML5-Formular-Entkopplung (`novalidate` & unblockiertes Speichern):**
  - `<form id="form-edit-miner">` verwendet nun `novalidate` und einen direkten Action-Trigger (`type="button"` mit `saveMinerSettings(event)`), wodurch Chromium/WebView2-Formularabbrüche durch inaktive Tabs (z.B. Lüfter- & Display-Felder) restlos eliminiert wurden.
  - Alle Gleitkomma-Eingabefelder unterstützen nun `step="any"` und verarbeiten deutsche Kommazahlen (z.B. `35,0`) sowie reine Ganzzahlen ohne stilles Zurückspringen auf Standardwerte.
- **Aktives Hochtakten bei thermischem & elektrischem Spielraum:**
  - Der Autotuner-Governor verharrt bei kühleren Minern (z.B. Setups mit 3 Noctua-Lüftern bei 64,2 °C) nicht mehr fälschlicherweise im toten Band unterhalb der Zieltemperatur (`target_temp`), sondern nutzt vorhandenen thermischen und elektrischen Spielraum (`max_watts` / `max_freq`) aktiv zum schrittweisen Hochtakten.
  - Erst beim Erreichen des Sweet Spots (Zieltemperatur ± Toleranz) oder der konfigurierten Obergrenzen (`max_freq`, `max_watts - 1.5W`) stabilisiert sich der Takt.
- **Transparente Anzeige der Obergrenzen auf den Miner-Karten:**
  - Auf den Dashboard-Karten werden konfigurierte Maxima nun permanent neben den Live-Werten dargestellt (z.B. `21.4 J/TH • Max: 35.0 W` und `1180 mV • Max: 900 MHz`), sodass vorgenommene Einstellungen stets verifizierbar sind.
- **Aktualisierte Schnell-Vorlagen (Presets):**
  - Die Vorlage „Power (66°C)“ setzt die Leistungsgrenze nun zeitgemäß auf `max_watts = 40.0 W` und `max_freq = 900 MHz` (zuvor hartkodiert 28 W / 775 MHz).
- **Visuelles Feedback bei erfolgreichem Speichern:**
  - Nach erfolgreichem Speichern von Einstellungen wird eine Bestätigung via iOS-Toast-Banner direkt im Dashboard eingeblendet.

---

## [2.3.7] - 2026-10-30

### 🚀 Freie Wertebereiche nach oben & Unbeschränkte Taktung (z.B. 900 MHz+)
- **Aufhebung künstlicher Obergrenzen:**
  - Sämtliche künstliche Begrenzungen für Frequenz, Spannung, Leistung und Temperaturschwellen in Hardware-Profilen (`hardware_profiles.py`) und Validierungsmodellen (`models.py`) wurden freigegeben (Frequenzen bis 2500 MHz, Spannungen bis 2500 mV, Leistungsaufnahme bis 150 W, Grenztemperaturen bis 95 °C / 110 °C VR).
  - Volle Flexibilität für Custom-Setups, stärkere Netzteile oder Spezialkühlungen (z.B. 3x Noctua Lüfter).
- **Sofortige Hardware-Taktung beim Speichern („apply_freq_now“):**
  - Beim Speichern von Miner-Einstellungen in den Optionen wird die gewünschte Taktfrequenz (`max_freq` / `target_freq`) ab sofort direkt an die AxeOS-Hardware übertragen und angewendet, anstatt nur passiv in der Konfigurationsdatei abgelegt zu werden.
  - Neue Option „Takt sofort auf Miner anwenden (Sofort-Taktung)“ im Optionen-Dialog (standardmäßig aktiv).
- **Dynamische Spannungs-Extrapolation für hohe Frequenzen:**
  - Bei Frequenzen oberhalb der hinterlegten Profil-Tabellenstufen (z.B. > 800 MHz beim BM1370) wird die benötigte Spannung anhand der linearen Steigung der obersten Spannungsstufen dynamisch extrapoliert, anstatt auf die Maximalspannung der Standardtabelle geklammert zu werden.
- **Aktives Hochtakten durch den Autotuner (`current_freq < min_freq`):**
  - Läuft ein Miner unterhalb der eingestellten Minimalfrequenz, verharrt der Autotuner nicht mehr im Status `OPTIMAL`, sondern taktet die Frequenz aktiv in `freq_step`-Schritten hoch, bis der Zielbereich erreicht ist (unter Berücksichtigung von thermischem und elektrischem Headroom).
- **Dauerhafte manuelle Taktung („∞ Dauerhaft“):**
  - Im Takt-Dialog steht neben den zeitbegrenzten Tests (2m, 5m, 15m, 30m) nun der Modus **„∞ Dauerhaft“** (`duration_minutes: 0`) zur Verfügung.
  - Speichert die gewählte Frequenz und Spannung direkt dauerhaft in die Miner-Konfiguration, ohne nach einer Testphase zurückzuspringen.

---

## [2.3.6] - 2026-10-30

### ⏱️ Zeitgesteuerter Test-Modus für manuelle Einstellungen & Test-Beendigung
- **Konfigurierbare Test-Dauer für manuelle Taktung:**
  - Manuelle Test-Einstellungen (`/api/miner/{ip}/tune`) überschreiben den Autotuner nun nicht mehr dauerhaft unbemerkt.
  - Im Dialog „Manuelle Frequenz / Spannung“ kann eine Test-Dauer in Minuten gewählt werden (Standard: 5 Minuten, mit Schnellwahltasten: 2m, 5m, 15m, 30m).
  - Nach Ablauf der gewählten Testdauer übernimmt der automatische Governor nahtlos wieder die Regelung und optimiert Frequenz und Spannung nach den hinterlegten Regeln.
- **Sofortiger Test-Abbruch & Rückkehr zur Automatik:**
  - Solange ein manueller Test aktiv ist, wechselt der „Testen“-Button auf der Miner-Karte dynamisch zu einem auffälligen roten Button **„Test beenden“**.
  - Ein Klick auf diesen Button oder Aufruf von `POST /api/miner/{ip}/tune/stop` beendet den Test-Modus sofort und übergibt die Kontrolle wieder an den Autotuner.
- **Echtzeit-Countdown & Statusanzeige:**
  - Das Dashboard zeigt während des Tests live verbleibende Minuten und Sekunden an (`Test-Modus aktiv: noch Xm Ys`).
  - Farbliche Hervorhebung des Status als aktiver manueller Test.

### 🛡️ BM1370 Spannungs-Sicherheitsboden & Governor-Härtung
- **Minimale Betriebsspannung für BM1370 (Bitaxe Gamma):**
  - Sicherheitsuntergrenze von 1140 mV für BM1370-Taktstufen eingeführt (Factory Default 1150 mV). Verhindert, dass der Autotuner den Chip bei Fehlern auf 1080–1100 mV untervoltet, was zu extremen ASIC-Fehlerraten (> 40 %) und PLL-Instabilitäten geführt hatte.
- **Drossel-Cooldown (15s Mindestabstand):**
  - Notabschläge bei thermischen Spitzen oder Watt-Überschreitungen werden nun auf maximal einen Schritt alle 15 Sekunden gedrosselt. Dies verhindert Kaskadeneffekte (z.B. 8 Taktsenkungen innerhalb von 29 Sekunden), die den PLL-Taktgenerator des ASIC einfrieren ließen.
- **Boot-Grace-Period (5 Minuten) für Error Runaway:**
  - Die Fehlerraten-Überwachung greift erst ab 300 Sekunden Uptime, um normale Initialisierungsfehler nach Kaltstarts oder Reboots nicht fälschlich als dauerhaften Hardware-Defekt einzustufen.
- **Filter für ungültige Boot-Temperaturen:**
  - Sensorauslesungen unter 10.0 °C (wie typischerweise -1.0 °C während des ESP32-Reboots) werden ignoriert und nicht fälschlich als thermischer Headroom für Hochtaktung interpretiert.

---

## [2.3.5] - 2026-10-29

### 🪟 Windows System-Tray Menü & Titel-Synchronisation
- **System-Tray Klick- und Rechtsklick-Menü:**
  - Beim Klick (Linksklick) oder Rechtsklick auf das BitAxeTool-Icon im Windows System-Tray öffnet sich nun direkt das Auswahlmenü mit den Optionen:
    - **„BitAxeTool öffnen“** (fokussiert und stellt das Desktop-Fenster sofort in den Vordergrund)
    - **„Im Web-Browser öffnen“**
    - **„Komplett schließen“** (beendet die Anwendung, den Webserver und alle Hintergrund-Threads vollständig)
- **Vollständige Versionsnummern-Synchronisation im Fenstertitel & Dashboard:**
  - Konsistente Darstellung von `v2.3.5` in der Windows-Titelleiste, im HTML-Titel, Header-Badge und Changelog-Modal.
  - Dynamischer Abgleich via `/api/version` stellt sicher, dass Fenstertitel und Header-Badges immer exakt mit der Backend-Version übereinstimmen.

### 🚀 Integriertes Firmware-Update-System (AxeOS / ESP-Miner Over-The-Air)
- **Update-Möglichkeit pro Miner & für alle Miner gleichzeitig:**
  - **1-Klick Rolling Update:** Alle aktiven Miner können mit einem einzigen Klick vollautomatisch nacheinander (sequentielles Rolling Update zur Schonung des Netzteils und Netzwerks) aktualisiert werden.
  - **Gezieltes Einzel-Update:** Firmware kann auch selektiv für einen einzelnen ausgewählten Miner geflasht werden (direkt über den neuen *Update*-Button auf der jeweiligen Miner-Karte oder über das Menü).
  - **1-Klick GitHub Release-Download:** Automatisches Abfragen und Herunterladen der neuesten offiziellen AxeOS-Firmware (`esp-miner.bin`) von GitHub (`bitaxeorg/ESP-Miner`) ohne manuelles Suchen.
  - **Manuelle Datei-Auswahl:** Unterstützung für den Upload beliebiger lokaler `.bin`-Dateien (`esp-miner.bin` oder `www.bin`).
  - **AxeOS 2.15+ Architektur-Unterstützung:** Volle Kompatibilität mit der Zusammenführung von Web-Frontend und Firmware in `esp-miner.bin` sowie Anbindung an die neue Pool-API `PUT /api/system/pools/*`.
  - **Live-Status & Verifikation:** Echtzeit-Fortschrittsanzeige in der Benutzeroberfläche, automatische Überwachung des Miner-Reboots und Prüfung der neuen Versionsnummer.

### 🛡️ ASIC-Error Runaway Guard
- **Schutz vor 100% Hardware-Fehlern:** Wenn ein übertakteter ASIC-Chip in einen Fehlerzustand gerät (> 15% ASIC-Fehlerrate nach Startphase), senkt der Governor Takt und Spannung sofort schrittweise ab, anstatt die Hashrate fälschlicherweise als optimal zu bewerten.

### 🧪 Test- & Netzwerk-Isolation
- **Vollständiges Hardware-Mocking in Tests:** `tests/conftest.py` fängt alle Netzwerk- und Update-Aufrufe an reale Miner im lokalen Netzwerk sicher ab.

---

## [2.3.4] - 2026-10-29

### 🚨 Präzise Alarme & Geräte-spezifische Konfiguration
- **Geräte-spezifische Alarmeinstellungen (Reiter „Alarme“ pro Miner):**
  - Jeder Miner besitzt nun im Bearbeiten-Dialog einen eigenen Reiter **„Alarme“**, in dem Alarme individuell für das jeweilige Gerät aktiviert oder stummgeschaltet werden können.
  - **Individuelle Alarmschwellen:** Einstellbare Überhitzungs-Alarmschwelle (`alarm_temp_threshold`, z.B. 70°C) und VRM-Spannungswandler-Schwelle (`alarm_vr_threshold`, z.B. 86°C) pro Gerät.
  - **Ereignisfilter pro Gerät:** Offline-Alarm und Watchdog-Reboot-Alarm können für jeden Miner separat ein- oder ausgeschaltet werden.
  - Vollständige Persistierung der Parameter in `config.json` und sofortige Synchronisation mit dem Hintergrund-Governor.

- **Beseitigung von Fehlalarmen bei Normaltemperatur (> 58°C):**
  - **Sicherheits-Puffer:** Chiptemperaturen unter 65°C sind gesunde Betriebstemperaturen und lösen garantiert niemals mehr einen Überhitzungsalarm oder Sirenenton aus.
  - **Saubere Trennung von Leistungs- und Notdrosselung:** Wenn das konfigurierte Watt-Limit erreicht oder überschritten wird, meldet der Governor nun präzise `POWER_THROTTLE` bzw. `POWER_LIMITED` anstelle eines irreführenden thermischen `EMERGENCY_THROTTLE`.
  - **Headroom-Hysterese (1.5W Puffer):** Verhindert permanentes Pendeln und wiederholtes Anschlagen der Leistungsgrenze zwischen 750 und 775 MHz.
  - Sanfte Takt-Absenkungen bei leichter Überschreitung des Zieltemperatur-Bandes werden im Protokoll nun sauber als `[INFO]` (Regelungsschritt) statt `[WARNING]` klassifiziert.

### 🪟 Windows System-Tray Minimierung
- **Minimieren in den Windows Infobereich (System-Tray):**
  - Das Minimieren des Hauptfensters blendet die App vollständig aus der Windows-Taskleiste aus und hält sie ressourcenschonend im System-Tray aktiv.
  - Info-Ballonhinweis beim Minimieren informiert über die Hintergrundausführung.
  - **Tray-Kontextmenü & 1-Klick-Wiederherstellung:**
    - Linksklick oder Doppelklick auf das BitAxeTool-Icon im Infobereich bringt das Anwendungsfenster sofort wieder in den Vordergrund (`show` & `restore`).
    - Kontextmenü mit Optionen: *BitAxeTool öffnen*, *Im Web-Browser öffnen* und *Beenden*.
    - Beim regulären Beenden über das Tray-Menü werden der Hintergrund-Webserver und alle Worker-Threads sauber heruntergefahren.

---

## [2.3.3] - 2026-10-28

### 🚨 Zuverlässiges Feedback beim Test-Alarm („Einstellungen testen“)
- **Garantiertes optisches & akustisches Feedback:**
  - Der Klick auf *„Einstellungen testen“* / *„Test-Alarm“* läuft niemals mehr ins Leere.
  - Das elegante **iOS Dynamic Island Dropdown-Banner** fährt oben herab mit App-Icon, Zeitstempel, Titel und Testnachricht.
  - Der synthetische **akustische Warnton** und die **Smartphone-Vibration** werden sofort ausgelöst.
  - Ein dediziertes **Rückmelde-Modal (`Test-Alarm Rückmeldung`)** poppt sofort auf und zeigt exakt an, welche Alarme aktiv sind (Ton/Vibration: aktiv ✓) und welchen Status die Sperrbildschirm-Push-Rechte auf dem aktuellen Endgerät haben.
- **Klarheit zu Safari & iOS-Mitteilungen:**
  - Auf iPhones (iOS 16.4+) sperrt Apple Web-Push im normalen Safari-Browser-Tab grundsätzlich – es existiert in den Safari-Einstellungen dafür technisch kein Schalter.
  - BitAxeTool erkennt nun vollautomatisch, ob es in einem Safari-Tab oder als installierte PWA-App auf dem Home-Bildschirm läuft.
  - Läuft die App im Safari-Tab, wird dem Anwender direkt der 10-Sekunden-Weg (*Teilen &rarr; „Zum Home-Bildschirm“*) erklärt, um native Sperrbildschirm-Mitteilungen freizuschalten.

---

## [2.3.2] - 2026-10-28

### 🔔 Safari & iOS Benachrichtigungs-Führung & PWA-Setup
- **Interaktiver Button & Schritt-für-Schritt-Anleitung:**
  - Der Button bei gesperrter/blockierter Berechtigung ist nicht mehr starr deaktiviert, sondern öffnet direkt die neue, detaillierte Anleitung zur Aktivierung von Mitteilungen.
  - Dedizierter Hilfe-Dialog (`Mitteilungen in Safari & iOS`) mit visuellen Schritt-Karten:
    - **Schritt 1:** Erklärung der Apple-Pflicht zur Home-Bildschirm-Installation (ab iOS 16.4 erlaubt Apple Web-Push auf iPhones ausschließlich für Apps auf dem Home-Bildschirm).
    - **Schritt 2:** Zurücksetzen der Website-Berechtigung in Safari über das `aA`-Menü.
    - **Schritt 3:** Überprüfung der iOS-Systemeinstellungen unter *Einstellungen -> Mitteilungen -> Safari/BitAxe*.
    - **Schritt 4:** Hinweis auf akustische Sofortalarme und Vibration, die im geöffneten Zustand auch ohne Push-Rechte immer zuverlässig anschlagen.
- **Sofortiges Feedback bei Test-Alarm:**
  - Beim Klick auf *Test-Alarm senden* wird auch bei fehlenden System-Rechten sofort der Alarmton abgespielt und Vibration ausgelöst, sodass der Anwender die Alarmfunktion direkt testen kann.

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
