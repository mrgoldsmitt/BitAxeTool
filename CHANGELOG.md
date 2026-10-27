# Changelog - BitAxeTool

Alle nennenswerten Änderungen an diesem Projekt werden in dieser Datei dokumentiert.

---

## [2.1.0] - 2026-10-27

### 🚀 Highlights & Neuerungen
- **Nativer Windows-Betrieb ohne Terminal:**
  - Vollständige Kompilierung als eigenständige Windows-Anwendung (`BitAxeTool.exe`) mittels PyInstaller mit `--windowed` Flag (kein störendes schwarzes Konsolenfenster).
  - Modernes, rahmenloses WebView2-Desktop-Fenster mit nativem Windows-Icon.
  - Alternativer No-Console-Starter (`Start_BitAxeTool.vbs`) für portable Nutzung.

- **Intelligente Port-Verwaltung (Konfliktfrei):**
  - Standardport von `8080` auf den reservierten Port `21420` geändert, um Überschneidungen mit anderen Programmen (z. B. Vulkansimulationen, Dev-Servern) vollständig zu verhindern.
  - Dynamischer Port-Fallback (`find_available_port`): Erkennt automatisch, falls ein Port belegt ist, und weicht unterbrechungsfrei auf den nächsten freien Port aus.

- **Überarbeitetes Autotuning & Thermische Regelung:**
  - **Symmetrisches Deadband:** Das Zieltemperatur-Band wurde von einem einseitigen harten Deckel auf ein stabiles Band umgestellt (`target_temp ± temp_tolerance`, z.B. 60°C - 64°C bei 62°C Sollwert).
  - **Thermische Reserven voll nutzbar:** Realistische und sichere Standardwerte hinterlegt (Sollwert 62°C, Notdrosselung erst bei 70°C, Power-Limit für BM1370 auf 26W angehoben). Miner werden jetzt sauber an die Maximalleistung herangeführt, ohne vorzeitig gedrosselt zu werden.
  - **Zustands-Zwischenspeicherung:** Frequenz- und Spannungswerte werden intern zwischengespeichert. Falls eine Telemetrie-Antwort kurzzeitig ausbleibt, fällt die Taktrate nicht mehr fälschlicherweise auf den Minimaltakt ab.
  - **Flatline-Watchdog korrigiert:** Der Watchdog rebootet nur noch bei echtem Freeze (0 GH/s über mehrere Zyklen), niemals mehr bei konstant gesunder Hashrate.

- **Echtzeit-Live-Protokoll & Persistentes Logging:**
  - **Live-Streaming behoben:** Neue Protokolleinträge werden nun sofort über WebSockets an alle offenen Fenster gestreamt (kein Neuladen der Seite mehr erforderlich).
  - **Persistentes Dateilog (`logs/bitaxe_monitor.log`):** Alle Warnungen, Fehler, Tuning-Entscheidungen und Telemetriedaten werden automatisch auf der Festplatte protokolliert.
  - **Periodisches Telemetrie-Tracking:** Alle 30 Sekunden wird ein kompakter Snapshot der Werte (Hashrate, Chip-Temp, VR-Temp, Watt, Takt, Spannung, Effizienz) aufgezeichnet.
  - **Log-Export & Filter:** Live-Protokoll im Browser mit Filtern ("Alle", "Governor", "Warnungen/Fehler", "Telemetrie") sowie Download-Button zum Herunterladen des Logs.

- **Schlichteres, benutzerfreundlicheres Design:**
  - Ruhige, übersichtliche Cockpit-Karten mit modernem Dark-Mode.
  - Aufgeräumte Miner-Karten mit direktem Fokus auf die 4 Kernwerte (Hashrate, Temperatur, Takt & Spannung, Effizienz & Leistung).
  - Alle erweiterten Parameter und Feineinstellungen bleiben über ein übersichtliches Einstellungsmenü vollständig erhalten.
  - Anzeige von Version und Changelog direkt im Interface.

---

## [2.0.0] - Vorversion
- Einführung des modularen FastAPI-Backends mit WebSocket-Telemetrie.
- Hardwareprofile für BM1366, BM1368, BM1370, BM1397.
- Asynchroner Subnetz-Scanner mit mDNS-Erkennung.
