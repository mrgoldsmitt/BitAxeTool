# BitAxeTool v2.3.7 - Multi-AutoTuner & Safety Governor für Windows 10/11 & Web

**BitAxeTool** ist eine moderne, hochgradig optimierte und stabile Steuerungs- und Überwachungssoftware für **Bitaxe Solo-Miner** (Gamma 601 / BM1370, Supra 401 / BM1368, Ultra 204 / BM1366, Max / BM1397, Hex etc.) unter **Windows 10 / 11**.

Das Tool passt die Taktfrequenz (MHz) und Kernspannung (mV) der Bitaxe-Prozessoren kontinuierlich und vollautomatisch in Abhängigkeit von den gemessenen Temperaturen und Leistungsgrenzen an, um stets die maximale Hashrate bei optimaler Energieeffizienz und Hardware-Sicherheit zu erzielen.

Zusätzlich bietet BitAxeTool eine reaktionsschnelle, mobile Web-Oberfläche für den LAN-Zugriff von jedem Smartphone (**iPhone**, **Android**) und Tablet (**iPad**).

---

## ⚡ Neu in Version 2.3.7

- 🚀 **Freie Wertebereiche & Unbeschränkte Taktung (z.B. 900 MHz+):**
  - Aufhebung aller künstlichen Obergrenzen für Frequenz, Kernspannung, Leistung und Schutztemperaturen in Hardware-Profilen und Validierungsmodellen. Ideal für Miner mit erweiterter Lüfterbestückung (z.B. 3x Noctua) oder Hochleistungs-Netzteilen.
- ⚡ **Sofortige Hardware-Taktung beim Speichern („apply_freq_now“):**
  - Beim Konfigurieren von Taktwerten im Optionen-Dialog wird die Zielfrequenz sofort an AxeOS übermittelt und angewendet, anstatt nur passiv in `config.json` hinterlegt zu werden.
- 📈 **Dynamische Spannungs-Extrapolation:**
  - Automatische lineare Hochrechnung der sicheren Spannung für Frequenzen oberhalb der vordefinierten Tabellen (z.B. > 800 MHz auf BM1370).
- 🔄 **Aktives Hochtakten bei `current_freq < min_freq`:**
  - Der Autotuner verharrt nicht mehr im Status `OPTIMAL`, wenn der Miner unterhalb der gewünschten Minimalfrequenz läuft, sondern taktet aktiv hoch, solange thermischer und elektrischer Headroom vorhanden ist.
- ♾️ **Dauerhafte manuelle Taktung („∞ Dauerhaft“):**
  - Schnellauswahl für permanente manuelle Taktung (`duration_minutes: 0`) im Takt-Dialog, die dauerhaft in der Gerätekonfiguration gespeichert wird, ohne nach einer Testphase zurückzuspringen.

---

## ⚡ Neu in Version 2.3.6

- ⏱️ **Zeitgesteuerter Test-Modus & Test-Beendigung:**
  - **Automatische Rückkehr zum Autotuner:** Manuelle Test-Einstellungen (`/api/miner/{ip}/tune`) laufen standardmäßig für konfigurierbare $x$ Minuten (Standard: 5 min; Schnellwahl für 2m, 5m, 15m, 30m). Nach Ablauf der Zeit übernimmt der Autotuner nahtlos wieder die Regelung.
  - **Sofortiger Abbruch-Button („Test beenden“):** Auf der Miner-Karte erscheint während eines aktiven Tests ein auffälliger roter Button, mit dem der Test jederzeit vorzeitig beendet werden kann.
  - **Live-Countdown:** Im Dashboard wird die verbleibende Testzeit in Minuten und Sekunden in Echtzeit angezeigt (`Test-Modus aktiv: noch Xm Ys`).
- 🛡️ **BM1370 Spannungs-Sicherheitsboden (1140 mV):**
  - Feste Untergrenze von mindestens 1140 mV für BM1370-ASICs (Bitaxe Gamma) in allen Profilstufen. Verhindert fatales Untervolten (1080–1100 mV) bei Fehlern, wodurch zuvor massive ASIC-Fehlerraten (> 40 %) ausgelöst wurden.
- 🧊 **Tuner-Schutzmechanismen & Kaskaden-Sperre:**
  - **Drossel-Cooldown (15s):** Begrenzt Notdrosselungen auf maximal einen Schritt alle 15 Sekunden, um ein Einfrieren der ASIC-Takt-PLL durch zu schnelle Frequenzänderungen zu verhindern.
  - **Boot-Grace-Period (5 min):** Schützt frische Reboots vor vorzeitigem Eingreifen des Error-Runaway-Wächters.
  - **Boot-Temperatur-Filter:** Ignoriert Sensor-Ausreißer (< 10.0 °C) während des ESP32-Bootvorgangs.

---

## ⚡ Neu in Version 2.3.5

- 🪟 **System-Tray Auswahlmenü & Versions-Synchronisation:**
  - Klick oder Rechtsklick auf das System-Tray-Icon öffnet das Menü mit Direktoptionen zum Öffnen des Tools oder zum vollständigen Beenden.
  - Nahtlose Versionsanzeige (`v2.3.5`) im Fenstertitel, im Browser und in allen UI-Headern.
- 🚀 **Integriertes Firmware-Update-System (AxeOS / ESP-Miner Over-The-Air):**
  - **Einzeln & für alle Miner gleichzeitig:** Firmware-Updates können nun wahlweise für ein einzelnes Gerät oder als sequentielles Rolling Update für alle konfigurierten Bitaxe-Miner im LAN mit einem Klick ausgeführt werden.
  - **1-Klick GitHub Release-Download:** Automatisches Abfragen und Herunterladen der neuesten offiziellen AxeOS-Firmware (`esp-miner.bin`) von GitHub (`bitaxeorg/ESP-Miner`) ohne manuelles Suchen.
  - **Manuelle Datei-Auswahl:** Möglichkeit zum Upload lokaler `.bin`-Dateien (`esp-miner.bin` oder `www.bin`).
  - **AxeOS 2.15+ Architektur-Unterstützung:** Volle Kompatibilität mit der Zusammenführung von Web-Frontend und Firmware in `esp-miner.bin` ab Version 2.15 sowie Anbindung an die neue Pool-API `PUT /api/system/pools/*`.
  - **Live-Status & Verifikation:** Detaillierte Fortschrittsanzeige mit Reboot-Überwachung und Versionsprüfung.
- 🛡️ **ASIC-Error Runaway Guard:**
  - Schutz vor 100% Hardware-Fehlern: Steigt die ASIC-Fehlerrate über 15 %, senkt der Governor Takt und Spannung sofort schrittweise ab.
- 🧪 **Vollständiges Mocking in Tests:**
  - `tests/conftest.py` fängt alle Netzwerkaufrufe an reale Miner im LAN sicher ab.

---

## ⚡ Neu in Version 2.3.4

- 🚨 **Präzise Alarme & Geräte-spezifische Konfiguration:**
  - Jeder Miner verfügt im Bearbeiten-Dialog (`modal-edit-miner`) über einen eigenen Reiter **„Alarme“**, in dem Alarme und Benachrichtigungen individuell für das jeweilige Gerät konfiguriert oder stummgeschaltet werden können.
  - **Individuelle Alarmschwellen:** Einstellbare Überhitzungsschwelle (`alarm_temp_threshold`, z.B. 70°C) und VRM-Spannungswandler-Schwelle (`alarm_vr_threshold`, z.B. 86°C) pro Gerät.
  - **Ereignisfilter pro Miner:** Offline-Ausfallalarm und Watchdog-Reboot-Alarm können für jedes Gerät separat festgelegt werden.
- 🛡️ **Beseitigung von Fehlalarmen bei Normaltemperatur (> 58°C):**
  - **Sicherheits-Puffer:** Chiptemperaturen unter 65°C sind gesunde Betriebstemperaturen und lösen garantiert niemals mehr einen Überhitzungsalarm oder Sirenenton aus.
  - **Saubere Trennung von Leistungs- und Notdrosselung:** Wenn das Watt-Limit erreicht wird, meldet der Governor nun präzise `POWER_THROTTLE` bzw. `POWER_LIMITED` anstelle eines irreführenden thermischen `EMERGENCY_THROTTLE`.
  - **Headroom-Hysterese (1.5W Puffer):** Verhindert wiederholtes Pendeln an der Leistungsgrenze zwischen 750 und 775 MHz.
  - Sanfte Takt-Absenkungen bei leichter Überschreitung des Zieltemperatur-Bandes werden im Protokoll nun sauber als `[INFO]` (Regelungsschritt) statt `[WARNING]` klassifiziert.
- 🪟 **Windows System-Tray Minimierung:**
  - Das Minimieren des Desktop-Fensters blendet die Anwendung vollständig aus der Windows-Taskleiste aus und hält sie ressourcenschonend im System-Tray aktiv.
  - Info-Ballonhinweis beim Minimieren informiert über die Hintergrundausführung.
  - **1-Klick-Wiederherstellung & Kontextmenü:** Linksklick oder Doppelklick auf das Tray-Icon stellt das Fenster sofort wieder her; Kontextmenü mit Optionen zum Öffnen im Browser oder sauberen Beenden.

---

## ⚡ Neu in Version 2.3.3

- 🚨 **Zuverlässiges Feedback beim Test-Alarm („Einstellungen testen“):**
  - Beim Klick auf *„Einstellungen testen“* / *„Test-Alarm“* öffnet sich nun immer sofort ein klares Rückmelde-Fenster mit detailliertem Status.
  - Das interaktive iOS-Dynamic-Island-Banner fährt oben am Bildschirmrand herunter, der akustische Warnton ertönt und die Smartphone-Vibration wird unmittelbar ausgelöst.
  - Kein stilles Verpuffen mehr, falls der Browser Push-Rechte noch nicht erteilt hat.
- 🍏 **Klarheit für iOS & Safari:**
  - Auf iPhones gibt es in Safari-Tabs prinzipiell keinen Schalter für Web-Push-Mitteilungen – Apple unterstützt Web-Push ausschließlich dann, wenn eine Web-App zum Home-Bildschirm hinzugefügt wurde.
  - Die App erkennt dies nun automatisch: Statt eines ins Leere laufenden Berechtigungsdialogs wird direkt die 10-Sekunden-Anleitung (*Teilen &rarr; Zum Home-Bildschirm*) angezeigt.
- 🔔 **Safari & iOS Benachrichtigungs-Führung (v2.3.2):**
  - Der Berechtigungs-Button führt bei blockiertem Status direkt zur interaktiven Schritt-für-Schritt-Anleitung für iPhone und Safari.
  - Ausführliche Erklärung zur Apple-PWA-Pflicht (ab iOS 16.4 erlaubt Apple Web-Push nur für Apps auf dem Home-Bildschirm).
  - Anleitung zum Zurücksetzen der Website-Berechtigungen über das Safari `aA`-Menü.
  - Sofortiges Abspielen von Warnton und Vibration beim Test-Alarm.
- 📱 **Modernes iOS Modal-Sheet-Design & Freeze-Fix:**
  - Feste obere Navigation: Tabs (`Tuning`, `Pools`, `Lüfter & Display`) bleiben beim Scrollen fest am oberen Rand verankert.
  - Feste untere Leiste: Die Aktions-Buttons (`Löschen`, `Abbrechen`, `Speichern`) sind stets sichtbar und sofort erreichbar.
  - Beseitigung des Safari/WebKit-Freezes beim Scrollen am Seitenende.
- 🔠 **Kompaktere Schaltflächen & verkleinerte Schriftgrößen:**
  - Deutlich reduzierte Schriftgrößen auf den Tabs und Preset-Buttons (`Eco`, `Ausgewogen`, `Power`) im 3-Spalten-Raster.
  - Direkte Touch- und Klick-Eventbindung ohne Verzögerung.
- ⛏️ **Vollständige Miner-Optionen & Stratum-Pools (AxeOS Sync):**
  - Primärer Mining-Pool & Fallback-Pool (Host, Port, Worker, Passwort, Difficulty) direkt in den Optionen einstellbar.
  - Hardware-, Lüfter- und Display-Setup (Hostname, automatische Lüfterregelung, manuelle Drehzahl, Screen-Invertierung, Timeout).
  - Nahtlose, asynchrone Übertragung an AxeOS via REST-API (`PATCH /api/system`).
- 🔄 **Synchronisation auf alle Miner derselben Art:**
  - 1-Klick-Übernahme aller Einstellungen (Tuning-Grenzen, Pools, Lüfter) auf alle erkannten Miner desselben Modells (z. B. alle BM1370).
- 📱 **Scroll- & Freeze-Fix für mobile Bildschirme:**
  - Z-Index-Korrektur (`z-index: 100000`): Dialoge liegen uneingeschränkt über dem schwebenden Bottom Dock.
  - `overscroll-behavior: contain` und Body-Scroll-Lock verhindern Hänger und Einfrieren in iOS Safari / WebKit.
- 📐 **Optimierte Formular-Breite (100% responsiv):**
  - `minmax(0, 1fr)` verhindert jegliches horizontales Abschneiden von Labels und Eingabefeldern auf Smartphones.
- 🗂️ **Segmentierte Reiter im Optionsdialog:**
  - Aufteilung in *Tuning & Thermik*, *Mining-Pools* und *Lüfter & Display* für schnelle und übersichtliche Bedienung.

---

## ⚡ Highlights früherer Versionen (v2.2.0 & v2.1.0)

- ⚙️ **Changelog, CC-Lizenz & Urheberrecht direkt in Settings:**
  - Vollständige Integration von Versionsverlauf, Lizenzdetails (CC BY-NC 4.0) und Entwickler-Attribution (`mrgoldsmitt`) mit Direktlink zu [mrgoldsmitt.work](https://mrgoldsmitt.work).
  - Übersichtliche Reiter-Navigation (Changelog, Lizenz, Über das Projekt) im Informationsdialog.
  - Ausfallsichere API-Endpunkte (`/api/changelog`, `/api/license`, `/api/version`).
- 📈 **24-Stunden-Verlaufsdiagramme als Interaktives Popup:**
  - Jede der 6 Kachel-Kennzahlen (Hashrate, Leistung, ASIC-Temp, VR-Temp, Effizienz, Miner-Anzahl) öffnet per Klick ein modales Verlaufsdiagramm mit echten historischen Daten.
  - Dynamischer Zeitfilter (`1 Std`, `6 Std`, `24 Std`) und Live-Statistikleiste (Aktuell, Min, Ø, Max).
- 📱 **Mobil-optimierte Miner-Kartenbreite & Best-Difficulty:**
  - 100% responsive Miner-Karten ohne Überlaufen oder horizontales Scrollen auf Smartphones.
  - Best Difficulty (`All-Time` & `Session / Boot`) direkt mit goldenem Stern auf jeder Miner-Karte integriert.
- ⚓ **Dauerhaft fixierte Navigationsleiste (iOS Bottom Dock):**
  - Schwebendes Liquid-Glass-Dock bleibt beim Scrollen fest am unteren Bildschirmrand verankert (`translateZ(0)` Hardwarebeschleunigung).
- 🔔 **Progressive Web App (PWA) & Smartphone-Alarme:**
  - Installierbar als native Web-App auf iOS und Android mit Offline-Shell.
  - Push- & Audio-Alarme bei Überhitzung, VRM-Limit, Offline-Status und Watchdog-Events.
- 🪟 **Nativer Windows-Betrieb ohne Terminal:**
  - Standalone kompiliert mit PyInstaller (`dist/BitAxeTool/BitAxeTool.exe`).
  - Kein schwarzes Terminalfenster mehr (`--windowed`).
  - Startbar per Doppelklick über `Start_BitAxeTool.vbs` oder direkt als `.exe`.
- 🛡️ **Kollisionsfreier Port:**
  - Standardport **`21420`** (vermeidet Port-Konflikte mit Port 8080).
  - Automatischer Ausweich-Portfinder bei bestehenden Belegungen.

---

## 🔍 Analyse & Verbesserungen gegenüber dem Referenzprogramm

Das bestehende Referenzprogramm (`Hurllz/bitaxe-temp-monitor`) wurde von uns tiefgreifend analysiert. Dabei wurden gravierende Schwachstellen identifiziert und in **BitAxeTool** von Grund auf neu und robuster gelöst:

| Problembereich im Referenzprojekt | Ursache & Fehler | Lösung & Verbesserung in BitAxeTool |
| :--- | :--- | :--- |
| **Netzwerk-Scan** | Synchroner `for`-Loop über bis zu 254 IPs (`requests.get(timeout=1)`). Scan dauert über **4 Minuten** und blockiert das gesamte Programm. | **Asynchroner Concurrent-Scanner** (`asyncio` + `httpx` mit Connection Pooling) + **mDNS/Zeroconf Discovery**. Scan des gesamten `/24`-Subnetzes in **~1,5 Sekunden**! |
| **Thread-Safety & Daten-Kollision** | Globale Variablen (`global running`, `global tier_list`) wurden zwischen allen Minern geteilt. Bei mehreren Minern überschrieben sich die Parameter gegenseitig. | **Isolierte `MinerWorker`-Tasks** mit eigenem State, Lock, Cancel-Tokens und individuellen Hardware-Profilen. |
| **Flapping & Oszillation (Sägezahn)** | Anpassung erfolgte alle 5 Sekunden, obwohl der ASIC-Siliziumkern 30–60 Sekunden braucht, um thermisch ins Gleichgewicht zu kommen. Führt zu extremen Temperaturschwankungen und Instabilitäten. | **Thermal Governor mit Hysteresis-Deadband** (Toleranzfenster z.B. 60–64°C = `OPTIMAL`) und **Stabilisierungs-Cooldown** (25s) vor Hochtakten, kombiniert mit **sofortiger Notdrosselung** bei Überhitzung. |
| **Hardcodierte Hardware-Tabellen** | Nur BM1370 Gamma wurde mit einer festen CSV unterstützt. BM1366, BM1368 oder Hex wurden nicht dynamisch erkannt. | Dynamische Abfrage der hardware-spezifischen Frequenz- und Spannungsstufen direkt über `/api/system/asic` (AxeOS 2.0+) mit Fallback auf kalibrierte Profile. |
| **Abstürze durch `ZeroDivisionError`** | Bei identischem `min_volt` und `max_volt` stürzte der Tuning-Loop ab. | Abgesicherte mathematische Normalisierung und Validierung aller Benutzereingaben per Pydantic. |
| **Benutzeroberfläche** | Veraltetes, starres Tkinter-Fenster ohne moderne Skalierung, Responsive-Fähigkeit oder Dark Mode. | **Hochmoderne, schlichte Obsidian-Dark-Oberfläche** mit Live-Charts, flüssigen Animationen und nativer Windows-Desktop-Integration (WebView2). |

---

## 🚀 Schnellstart & Installation

### Option A: Fertige Windows-Anwendung starten (Empfohlen)
- Doppelklick auf **`dist\BitAxeTool\BitAxeTool.exe`** oder **`Start_BitAxeTool.vbs`**.
- Öffnet direkt das native Windows-Fenster ohne Terminal oder CMD-Box.

### Option B: Windows-Installer (.exe) ausführen
- Der fertige Windows-Installer liegt in:
  `installer_output\BitAxeTool_Setup_v2.3.5.exe`
- Installiert das Tool mit Desktop-Verknüpfung und Deinstallationsfunktion.

### Option C: Aus dem Quellcode starten
- Doppelklick auf **`Run_BitAxeTool.bat`**.

---

## 📡 AxeOS REST API Dokumentation

BitAxeTool kommuniziert nativ mit der unverschlüsselten REST-API von AxeOS:

- **`GET /api/system/info`**:
  Ruft ASIC-Temperatur (`temp`), VR-Temperatur (`vrTemp`), aktuelle Frequenz (`frequency`), Kernspannung (`coreVoltage`), Hashrate (`hashRate`), Leistungsaufnahme (`power`), Lüfterdrehzahl (`fanrpm` / `fanspeed`) und Akzeptierte/Verworfene Shares ab.
- **`GET /api/system/asic`**:
  Liefert die hardware-unterstützten Frequenzschritte (`frequencyOptions`) und Spannungen (`voltageOptions`).
- **`PATCH /api/system`**:
  Setzt Takt und Spannung sofort auf Hardwareebene:
  ```json
  {
    "frequency": 600,
    "coreVoltage": 1120
  }
  ```
- **`POST /api/system/restart`**:
  Startet den ESP32 und das ASIC-Board neu.

- **`POST /api/system/identify`**:
  Lässt den Bildschirm des Miners aufleuchten („Finden“).

---

## 🧪 Tests ausführen

Zur Überprüfung aller Komponenten (Regelung, Interpolation, Sicherheitsschwellen, API):
```bash
python -m pytest tests/
```

---

## ⚖️ Urheberrecht & Creative Commons Lizenz

Copyright (c) 2026 **[mrgoldsmitt](https://mrgoldsmitt.work)**

Dieses Projekt ist unter der **Creative Commons Attribution-NonCommercial 4.0 International Public License (CC BY-NC 4.0)** lizenziert.

- **Namensnennung (Attribution):** Der Urheber **mrgoldsmitt** ist stets mit Verweis auf seine Webseite ([mrgoldsmitt.work](https://mrgoldsmitt.work)) anzugeben.
- **Nicht-kommerziell (NonCommercial):** Eine kommerzielle Nutzung der Software und abgeleiteter Werke ist ohne gesonderte Genehmigung untersagt.
- Vollständiger Lizenztext: Siehe [LICENSE](LICENSE) oder [creativecommons.org/licenses/by-nc/4.0](https://creativecommons.org/licenses/by-nc/4.0/).
