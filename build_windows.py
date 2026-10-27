"""Build script to create a standalone Windows .exe using PyInstaller."""

import os
import sys
import subprocess
import shutil

def build():
    print("=== Building BitAxeTool for Windows ===")
    
    # Ensure pyinstaller is installed
    try:
        import PyInstaller
    except ImportError:
        print("[*] Installing pyinstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    icon_path = os.path.abspath(os.path.join("assets", "bitaxe_icon.ico"))
    static_path = os.path.abspath(os.path.join("app", "static"))
    assets_path = os.path.abspath("assets")
    changelog_path = os.path.abspath("CHANGELOG.md")

    # Separator for PyInstaller --add-data (';' on Windows, ':' on Unix)
    sep = ";" if sys.platform.startswith("win") else ":"

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name=BitAxeTool",
        "--noconfirm",
        "--onedir",   # onedir is fast, clean, and reliable with WebView2
        "--windowed", # No black command console window (GUI mode)
        f"--icon={icon_path}",
        f"--add-data={static_path}{sep}app/static",
        f"--add-data={assets_path}{sep}assets",
        f"--add-data={changelog_path}{sep}.",
        "--collect-all=zeroconf",
        "--collect-all=uvicorn",
        "--collect-all=fastapi",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.protocols.websockets",
        "--hidden-import=uvicorn.protocols.websockets.auto",
        "--hidden-import=uvicorn.lifespan",
        "--hidden-import=uvicorn.lifespan.on",
        "--hidden-import=zeroconf._utils.ipaddress",
        "--hidden-import=zeroconf._handlers.answers",
        "app/main.py"
    ]

    print(f"Executing: {' '.join(cmd)}")
    subprocess.check_call(cmd)
    print("\n[SUCCESS] Build complete! Executable located in dist/BitAxeTool/BitAxeTool.exe")

if __name__ == "__main__":
    build()
