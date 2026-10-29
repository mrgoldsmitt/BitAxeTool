# BitAxeTool - Deployment Pipeline & Guidelines

Dieses Dokument definiert den verbindlichen Deployment-Ablauf für das Projekt **BitAxeTool**.

## Deployment-Pipeline Schritte

Sobald ein Release oder ein Build bereitgestellt werden soll, sind folgende drei Schritte in exakt dieser Reihenfolge durchzuführen:

### 1. Kompilieren für Windows (Standalone & Installer)
1. **PyInstaller Build ausführen:**
   ```powershell
   .\.venv\Scripts\python.exe build_windows.py
   ```
   Erzeugt die eigenständige Anwendung in `dist\BitAxeTool\BitAxeTool.exe`.
2. **Inno Setup Installer kompilieren:**
   - Version in `installer.iss` prüfen/aktualisieren (`#define MyAppVersion "X.Y.Z"`).
   - Inno Setup Compiler (`ISCC.exe`) aufrufen:
     ```cmd
     "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
     ```
   - Erzeugt das Installationspaket in `installer_output\BitAxeTool_Setup_vX.Y.Z.exe`.

### 2. Upload / Sync auf GitHub
1. Änderungen stagen und mit semantischem Versions-Commit einchecken:
   ```powershell
   git add .
   git commit -m "feat(vX.Y.Z): <Beschreibung der Änderungen>"
   ```
2. Auf das GitHub-Repository `origin/main` pushen:
   ```powershell
   git push origin main
   ```
3. Optional: Git-Tag setzen und pushen:
   ```powershell
   git tag "vX.Y.Z"
   git push origin "vX.Y.Z"
   ```

### 3. Backup im SynologyDrive Archiv
1. Das Tool als ZIP-Archiv verpacken mit der standardisierten Namenskonvention:
   `BitAxeTool_backup v.X.Y.Z.zip`
   *(Root-Ordner im Zip: `BitAxeTool/`, unter Ausschluss von `.venv`, `build/`, `.pytest_cache` und temporären Logs)*
2. Die ZIP-Datei in den Zielpfad kopieren bzw. verschieben:
   `L:\SynologyDrive\Office\Privat\Anwendungsprojekte\BitAxeTool\`
