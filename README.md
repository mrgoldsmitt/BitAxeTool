# BitAxeTool v2.3.2 - Multi-AutoTuner & Safety Governor für Windows 10/11 & Web

**BitAxeTool** ist eine moderne, hochgradig optimierte und stabile Steuerungs- und Überwachungssoftware für **Bitaxe Solo-Miner** (Gamma 601 / BM1370, Supra 401 / BM1368, Ultra 204 / BM1366, Max / BM1397, Hex etc.) unter **Windows 10 / 11**.

Das Tool passt die Taktfrequenz (MHz) und Kernspannung (mV) der Bitaxe-Prozessoren kontinuierlich und vollautomatisch in Abhängigkeit von den gemessenen Temperaturen und Leistungsgrenzen an, um stets die maximale Hashrate bei optimaler Energieeffizienz und Hardware-Sicherheit zu erzielen.

Zusätzlich bietet BitAxeTool eine reaktionsschnelle, mobile Web-Oberfläche für den LAN-Zugriff von jedem Smartphone (**iPhone**, **Android**) und Tablet (**iPad**).

---

## ⚡ Neu in Version 2.3.2

- 🔔 **Safari & iOS Benachrichtigungs-Führung:**
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
  `installer_output\BitAxeTool_Setup_v2.3.2.exe`
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
